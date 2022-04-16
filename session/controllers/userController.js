require('dotenv').config()
const UserModel = require('../Models/User');
const nodemailer = require('nodemailer');
const process = require('process');

/*
async function sendMail(recipient, user, key) {
  //URGH POSTFIX SMTP SERVER MILESTONE 3
  console.log(process.env);
  const host = process.env['SMTP_HOST'];
  // console.log("value of host in sendMail: ", host)
  const link = encodeURI(`http://${host}/users/verify/?key=${key}&name=${user}`);
  const transporter = nodemailer.createTransport({
    service: 'postfix',
    host: host,
    port: 25,
    auth: {
      user: process.env['SMTP_USER'],
      pass: process.env['SMTP_PASS'],
    },
  });
  console.log(recipient);
  const mailOptions = {
    from: `${process.env['SMTP_NAME']} <${process.env['SMTP_NAME']}@${process.env['SMTP_HOST']}>`,
    to: recipient,
    subject: 'Doogle Gocs Verification Email',
    text: link,
  };
  transporter.sendMail(mailOptions, function (error, info) {
    if (error) {
      console.log(error);
    } else {
      console.log('Email sent: ');
    }
  });
}
*/

async function sendMail(recipient, user, key) {
  //URGH POSTFIX SMTP SERVER MILESTONE 3
  console.log(process.env);
  const host = "backyardigans.cse356.compas.cs.stonybrook.edu";
  // console.log("value of host in sendMail: ", host)
  const link = encodeURI(`http://${host}/users/verify/?key=${key}&name=${user}`);
  const transporter = nodemailer.createTransport({
    service: 'postfix',
    host: host,
    port: 25,
    auth: {
      user: "root",
      pass: "cse356!!!312asdacm",
    },
  });
  console.log(recipient);
  const mailOptions = {
    from: "backyardigans@backyardigans.cse356.compas.cs.stonybrook.edu",
    to: recipient,
    subject: 'Doogle Gocs Verification Email',
    text: link,
  };
  transporter.sendMail(mailOptions, function (error, info) {
    if (error) {
      console.log(error);
    } else {
      console.log('Email sent: ');
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
    res.json({ error: true, message: 'name already taken' });
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
  res.json({ ok: true, message: 'user added.' });
  res.end();
};

//email takes in an email, and password
exports.handleLogin = async (req, res, next) => {
  const { email, password } = req.body;
  const user = await UserModel.findOne({ email });

  if (!user) {
    console.log('User does not exist!');
    res.json({ error: true, message: 'user does not exist' });
  } else if (password != user.password) {
    console.log("form password: " + password)
    console.log("user password: " + user.password)
    console.log('Wrong Password');
    res.json({ error: true, message: 'Wrong password' });
  } else if (!user.active) {
    console.log('User is not verified yet');
    res.json({ error: true, message: 'User is not verified.' });
  } else {
    console.log('Successful login');
    req.session.isAuth = true;
    req.session.username = user.name;
    res.json({ name: user.name });
  }
  return;
};

exports.handleLogout = (req, res, next) => {
  req.session.destroy((err) => {
    if (err) {
      res.json({ error: true, message: 'user not found' });
    }
    console.log('logged out');
  });
  res.end();
};

//assumes request sends name and key
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
  console.log('user verified!');
  res.json({ ok: true, message: 'user verified' });
  res.end();
};
