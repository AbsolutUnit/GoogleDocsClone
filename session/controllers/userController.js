const UserModel = require('../Models/User');

async function sendMail(recipient, user, key) {
  //URGH POSTFIX SMTP SERVER MILESTONE 3
  const link = `http://localhost:8080/users/verify/?name=${user}&key=${key}`;
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: 'kychao@cs.stonybrook.edu',
      pass: 'Sbcs11203100', // definitely not my real password
    },
  });
  const mailOptions = {
    from: 'doogleGocs.com',
    to: recipient,
    subject: 'Doogle Gocs Verification Email',
    text: link,
  };
  transporter.sendMail(mailOptions, function (error, info) {
    if (error) {
      console.log(error);
    } else {
      console.log('Email sent: ' + info.response);
    }
  });
}

//assumes body has name, email, password.
exports.handleAddUser = async (req, res, next) => {
  //TODO add error handling for missing password or name
  const { name, email, password } = req.body;
  let user = await UserModel.findOne({ name });
  if (user) {
    console.log('name already taken!');
    res.end();
    return;
  }
  const key = parseInt(Math.random() * 1000000000);
  const active = false;
  user = new UserModel({
    name,
    password, // TODO: do i want to encrypt this password
    email,
    active,
    key, // TODO: encrypt this too if i am not lazy
  });
  await user.save();
  console.log('user saved');

  //send email for verification, clicking link will hit endpoint
  sendMail(email, name, key);
  res.end();
};

//email takes in an email, and password
exports.handleLogin = async (req, res, next) => {
  const { email, password } = req.body;
  const user = await UserModel.findOne({ email });

  if (!user) {
    console.log('User does not exist!');
  } else if (password != user.password) {
    console.log('Wrong Password');
  } else if (!user.active) {
    console.log('User is not verified yet');
  } else {
    console.log('Successful login');
    req.session.isAuth = true;
    res.json({ name: user.name });
  }
  res.end();
  return;
};

exports.handleLogout = (req, res, next) => {
  req.session.destroy((err) => {
    if (err) throw err;
    console.log('logged out');
  });
  res.end();
};

//assumes request sends name and key
exports.handleVerify = async (req, res, next) => {
  const name = req.query.name,
    key = req.query.key;
  const user = await UserModel.findOne({ name });
  if (!user || user.active) {
    console.log('user not found or was already active');
    res.end();
    return;
  }
  if (key == user.key) {
    user.active = true; // i hope this works
    await user.save();
  } else {
    console.log('invalid key matching, user is not valid');
  }
  console.log('user verified!');
  res.end();
};
