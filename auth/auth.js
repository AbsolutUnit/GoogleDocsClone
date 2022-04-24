require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const session = require('express-session');
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');
const process = require('process');
const MongoDBSession = require('connect-mongodb-session')(session);
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// db setup
const mongoURI = process.env["MONGO_URI"];
mongoose
  .connect(mongoURI, {
    useNewURLParser: true,
    //useCreateIndex: true,
    useUnifiedTopology: true,
  })
  .then((res) => {
    console.log('MongoDB connected');
  });
const store = new MongoDBSession({
  uri: mongoURI,
  collection: 'users',
});
const userSchema = new Schema({
    name: {
      type: String,
      required: true,
    },
    password: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
    },
    active: {
      type: Boolean,
      required: true,
    },
    key: {
      type: String,
      required: true,
    },
});
const UserModel = mongoose.model('User', userSchema);

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
  transporter.sendMail(mailOptions, function (error, info) {
    if (error) {
      console.log('failed to send email: ', error);
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
const handleLogin = async (req, res, next) => {
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
const handleLogout = (req, res, next) => {
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
const handleVerify = async (req, res, next) => {
  const name = decodeURI(req.query.name);
  const key = req.query.key;
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

const app = express();
app.use(cors());
app.use((req, res, next) => {
  console.log(req.url);
  console.log(req.body);
  next();
});
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
    res.setHeader('X-CSE356', process.env['CSE_356_ID']);
    next();
});
app.use(
    session({ // TODO: not sure if auth session middleware dif from document session middleware
      secret: 'some key', // TODO: .env this?
      resave: false,
      saveUninitialized: false,
      store: store,
    })
);

app.post('/users/signup', handleAddUser);
app.post('/users/login', handleLogin);
app.post('/users/logout', handleLogout);
app.get('/users/verify', handleVerify);

const port = 8081
app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});
