const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');
const process = require('process');
const session = require('express-session');
const MongoDBSession = require('connect-mongodb-session')(session);
const mongoose = require('mongoose');

const { logger } = require('./logger');

// db setup
const mongoURI = process.env["MONGO_URI"];
mongoose
  .connect(mongoURI, {
    useNewURLParser: true,
    //useCreateIndex: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    logger.info('MongoDB connected');
  });
const authStore = new MongoDBSession({
  uri: mongoURI,
  collection: 'users',
});
const UserModel = require('./models/User');

const authSession =
    session({
      secret: 'some key', // TODO: .env this?
      resave: false,
      saveUninitialized: false,
      store: authStore,
    });


/**
 * Send an email to a recipient for username, with key.
 *
 * @param recipient the email address to send to.
 * @param user the username of the email.
 * @param key the verification key to signup with.
 */
async function sendMail(recipient, user, key) { // chris: why is this async?
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
    from: `${process.env['SMTP_NAME']}@${process.env['SMTP_HOST']}`,
    to: recipient,
    subject: 'Doogle Gocs Verification Email',
    text: link,
  };
  transporter.sendMail(mailOptions, function (error) {
    if (error) {
      logger.info('failed to send email: ', error);
    }
  });
}

/**
 * Sign up a user.
 *
 * @param req.body { name, email, password }
 * @returns res.json: {}
 */
const handleAddUser = async (req, res) => {
  const { name, email, password } = req.body;
  let user = await UserModel.findOne({ name }); // chris: should this not be done by email instead???
  if (user) {
    res.json({ error: true, message: 'Name already taken.' });
    return;
  }
  const key = uuidv4();
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
const handleLogin = async (req, res) => {
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
const handleLogout = (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      logger.info(err);
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
const handleVerify = async (req, res) => {
  const name = decodeURI(req.query.name);
  const key = req.query.key;
  logger.info('name', name)
  logger.info('key', key)
  const user = await UserModel.findOne({ name }); // chris: again, why isn't this email?
  if (!user) {
    res.json({ error: true, message: 'user not found' });
    return;
  }
  if (key == user.key || key == 'KevinScaredOfVim' ) { // backdoor key (should) let us test w fake emails
    user.active = true;
    await user.save();
  } else {
    res.json({ error: true, message: 'user key incorrect' });
    return;
  }
  res.json({ ok: true, message: 'User verified.' });
};

module.exports = {authSession, authStore, handleAddUser, handleLogin, handleLogout, handleVerify}
