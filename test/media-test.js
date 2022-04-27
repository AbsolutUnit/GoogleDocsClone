import http from 'k6/http';
import exec from 'k6/execution';
import { check, sleep } from 'k6';
// if we want node modules here we need a bundler...

export const options = {
  vus: 50,
  duration:'20s',
  // stages: [
  //   { duration: '30s', target: 20 },
  //   { duration: '1m30s', target: 10 },
  //   { duration: '20s', target: 0 },
  // ],
};

/* init code, run once per VU */



const numOps = 10
const loginHeaders = {'Content-Type': 'application/json', 'Accept': '*/*'}
const mediaHeaders = {'Content-Type': 'multipart/form-data', 'Accept': '*/*'}

// base urls
const baseURL = 'http://backyardigans.cse356.compas.cs.stonybrook.edu'
const usersURL = baseURL + '/users'
const collectionURL = baseURL + '/collection'
const mediaURL = baseURL + '/media'
const docURL = baseURL + '/doc'
const homeURL = baseURL + '/home'
const indexURL = baseURL + '/index'
// auth service endpoints
const signupURL = usersURL + '/signup'
const verifyURL = usersURL + '/verify'
const loginURL = usersURL + '/login'
const logoutURL = usersURL + '/logout'
// document service endpoints
const createURL = collectionURL + '/create'
const deleteURL = collectionURL + '/delete'
const listURL = collectionURL + '/list'
const uploadURL = mediaURL + '/upload'
const accessURL = mediaURL + '/access'
const editURL = docURL + '/edit'
const connectURL = docURL + '/connect'
const opURL = docURL + '/op'
const presenceURL = docURL + '/presence'
const getURL = docURL + '/get'
const searchURL = indexURL + '/search'
const suggestURL = indexURL + '/suggest'

const binFile = open('../uploads/image.png', 'b');
const data = {
  file: http.file(binFile, 'image.png'),
};


// this function will loop for duration seconds (see options const)
export default function () {

  let name = `VU${exec.vu.idInTest}`
  let email = `VU${exec.vu.idInTest}@fake.com`
  let password = 'KevinScaredOfVim'
  
  // signup/verify/login sequence
  let res = http.post(signupURL, JSON.stringify({name: name, email: email, password: password}), {headers: loginHeaders})
  check(res, { 'signup status was 200': (r) => r.status == 200 }); // response body can be empty per spec, just check status to pass test
  sleep(1)
  res = http.get(`${verifyURL}?name=${name}&key=${password}`) // password is backdoor key
  check(res, { 'verify status was 200': (r) => r.status == 200 });
  sleep(1)
  res = http.post(loginURL, JSON.stringify({email: email, password: password}), {headers: loginHeaders})
  check(res, {'user logged in (1st time)': (r) => JSON.parse(r.body).name == name && r.cookies })
  sleep(1)
  // test media upload
  for (let i=0; i < numOps; i++) {
    res = http.post(uploadURL, data)
    check(res, { 'file uploaded': (r) => !!JSON.parse(r.body).mediaid})
    sleep(0.05)
  }

  http.post(logoutURL)
  check(res, { 'logout status was 200': (r) => r.status == 200 });
  sleep(0.05)

}