const UserModel = require('../Models/User');
const nodemailer = require('nodemailer');
const process = require('process');

/**
 * Send an email to a recipient for username, with key.
 *
 * @param recipient the email address to send to.
 * @param user the username of the email.
 * @param key the verification key to signup with.
 */
async function sendMail(recipient, user, key) {
  const host = process.env['SMTP_HOST'];
  const link = encodeURI(
    `http://${host}/users/verify/?key=${key}&name=${user}`
  );
  const transporter = nodemailer.createTransport({
    service: 'postfix',
    host: host,
    port: 25,
    auth: {
      user: process.env['SMTP_USER'],
      pass: process.env['SMTP_PASS'],
    },
  });
  const mailOptions = {
    from: `${process.env['SMTP_NAME']} <${process.env['SMTP_NAME']}@${process.env['SMTP_HOST']}>`,
    to: recipient,
    subject: 'Doogle Gocs Verification Email',
    text: link,
  };
  transporter.sendMail(mailOptions, function (error, info) {
    if (error) {
      console.log(error);
    }
  });
}

/**
 * Sign up a user.
 *
 * @param req.body { name, email, password }
 * @returns res.json: {}
 */
exports.handleAddUser = async (req, res) => {
  const { name, email, password } = req.body;
  let user = await UserModel.findOne({ name });
  if (user) {
    res.json({ error: true, message: 'Name already taken.' });
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

  //send email for verification, clicking link will hit endpoint
  sendMail(email, name, key);
  res.json({ ok: true, message: 'User added.' });
};

/**
 * Handle the user login enpoint.
 *
 * @param req.body { email, password }
 * @returns res.json: { name }
 */
exports.handleLogin = async (req, res, next) => {
  const { email, password } = req.body;
  const user = await UserModel.findOne({ email });

  if (!user) {
    res.json({ error: true, message: 'User does not exist.' });
  } else if (password != user.password) {
    res.json({ error: true, message: 'Wrong password' });
  } else if (!user.active) {
    res.json({ error: true, message: 'User is not verified.' });
  } else {
    req.session.isAuth = true;
    req.session.username = user.name;
    res.json({ name: user.name });
  }
  return;
};

/**
 * Logout a user.
 *
 * @param req.body {}
 * @returns res.json: {}
 */
exports.handleLogout = (req, res, next) => {
  req.session.destroy((err) => {
    if (err) {
      console.log(err);
      res.json({ error: true, message: 'User not found.' });
    }
  });
  res.json({});
};

/**
 * Verify a user's email.
 * @param req.query {name, key}
 * @returns: res.json: {}
 */
exports.handleVerify = async (req, res, next) => {
  const name = decodeURI(req.query.name);
  const key = req.query.key;
  const user = await UserModel.findOne({ name });
  if (!user) {
    res.json({ error: true, message: 'user not found' });
    return;
  }
  if (key == user.key) {
    user.active = true;
    await user.save();
  } else {
    res.json({ error: true, message: 'user not found' });
    return;
  }
  res.json({ ok: true, message: 'User verified.' });
};
