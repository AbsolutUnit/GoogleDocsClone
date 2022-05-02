import http from 'k6/http';
import exec from 'k6/execution';
import { check, sleep } from 'k6';
// if we want node modules here we need a bundler...

export const options = {
  vus: 1,
  duration:'10s'
  // stages: [
  //   { duration: '30s', target: 20 },
  //   { duration: '1m30s', target: 10 },
  //   { duration: '20s', target: 0 },
  // ],
};

/* init code, run once per VU */



const loginHeaders = {'Content-Type': 'application/json', 'Accept': '*/*'}

// base urls
const baseURL = 'http://backyardigans.cse356.compas.cs.stonybrook.edu'
const deleteURL = baseURL + '/index/deleteIndex'

// this function will loop for duration seconds (see options const)
export default function () {

  let name = `VU${exec.vu.idInTest}`
  let email = `VU${exec.vu.idInTest}@fake.com`
  let password = 'KevinScaredOfVim'
  
  // signup/verify/login sequence
  let res = http.post(signupURL, JSON.stringify({name: name, email: email, password: password}), {headers: loginHeaders})
  check(res, { 'signup status was 200': (r) => r.status == 200 }); // response body can be empty per spec, just check status to pass test
  sleep(0.5)
  res = http.get(`${verifyURL}?name=${name}&key=${password}`) // password is backdoor key
  check(res, { 'verify status was 200': (r) => r.status == 200 });
  sleep(0.5)
  res = http.post(loginURL, JSON.stringify({email: email, password: password}), {headers: loginHeaders})
  check(res, {'user logged in': (r) => JSON.parse(r.body).name == name && r.cookies })
  sleep(0.5)

  res = http.post(`${indexURL}/deleteIndex`)
  check(res, {'index deleted (probably)': (r) => r.body != ''})

  sleep(2)

}
