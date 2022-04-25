import http from 'k6/http';
import exec from 'k6/execution';
import { check, sleep } from 'k6';
// if we want node modules here we need a bundler...

export const options = {
  vus: 5,
  duration:'2m',
  // stages: [
  //   { duration: '30s', target: 20 },
  //   { duration: '1m30s', target: 10 },
  //   { duration: '20s', target: 0 },
  // ],
};

/* init code, run once per VU */

const numOps = 400
const headers = {'Content-Type': 'application/json', 'Accept': '*/*'}

// base urls
const baseURL = 'http://209.94.56.214'
const usersURL = baseURL + '/users'
const collectionURL = baseURL + '/collection'
const mediaURL = baseURL + '/media'
const docURL = baseURL + '/doc'
const homeURL = baseURL + '/home'
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


// this function will loop for duration seconds (see options const)
export default function () {

  let name = `VU${exec.vu.idInTest}`
  let email = `VU${exec.vu.idInTest}@fake.com`
  let password = 'KevinScaredOfVim'
  
  // signup/verify/login sequence
  let res = http.post(signupURL, JSON.stringify({name: name, email: email, password: password}), {headers: headers})
  check(res, { 'signup status was 200': (r) => r.status == 200 }); // response body can be empty per spec, just check status to pass test
  sleep(1)
  res = http.get(`${verifyURL}?name=${name}&key=${password}`) // password is backdoor key
  check(res, { 'verify status was 200': (r) => r.status == 200 });
  sleep(1)
  res = http.post(loginURL, JSON.stringify({email: email, password: password}), {headers: headers})
  check(res, {'user logged in (1st time)': (r) => JSON.parse(r.body).name == name && r.cookies })
  sleep(1)
  http.post(logoutURL)
  check(res, { 'logout status was 200': (r) => r.status == 200 });
  sleep(1)
  res = http.post(loginURL, JSON.stringify({email: email, password: password}), {headers: headers})
  check(res, {'user logged in (2nd time)': (r) => JSON.parse(r.body).name == name && r.cookies })
  sleep(1)

  // doc creation and op submission sequence
  res = http.post(createURL, JSON.stringify({name: name}), {headers: headers}) // every VU creates its own doc for now
  check(res, {'docid returned': (r) => !!JSON.parse(r.body).docid })
  let docID = JSON.parse(res.body).docid
  let clientID = name
  sleep(0.5)
  let version = 0
  for (let i=0; i < numOps; i++) {
    sleep(0.05)
    let op = [{ insert: `${name}&${i}` }]
    res = http.post(`${opURL}/${docID}/${clientID}`, JSON.stringify({version: version, op: op}), {headers: headers})
    while (JSON.parse(res.body).status === 'retry') {
      version++
      sleep(0.05)
      res = http.post(`${opURL}/${docID}/${clientID}`, JSON.stringify({version: version, op: op}), {headers: headers})
    }
    check(res, { 'submitted op': (r) => JSON.parse(r.body).status === 'ok' })
    if (JSON.parse(res.body).status === 'ok') version++

    // next get html or smth back for each document? (maybe console log snippet? check first few are VU1&1VU1&2VU1&3...)
  }
}
// cookies will be cleared and TCP conns torn down before default func runs again