import http from 'k6/http';
import exec from 'k6/execution';
import { check, sleep } from 'k6';
// if we want node modules here we need a bundler...

export const options = {
  vus: 1,
  duration:'30s',
  // stages: [
  //   { duration: '30s', target: 20 },
  //   { duration: '1m30s', target: 10 },
  //   { duration: '20s', target: 0 },
  // ],
};

/* init code, run once per VU */



const numOps = 30
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

const lorem = `Far far away, behind the word mountains, philosophicaltahr defensivesnipe instantcuckoo far from the countries Vokalia and Consonantia, reducedseahorse there live the blind texts. Separated they live in Bookmarksgrove right at the coast of the Semantics, a large language ocean. A small river named Duden flows by their place and supplies it with the necessary regelialia. It is a paradisematic country, in which roasted parts of sentences fly into your mouth. Even the all-powerful Pointing has no control about the blind texts it is an almost unorthographic life One day however a small line of blind text by the name of Lorem Ipsum decided to leave for the far World of Grammar. The Big Oxmox advised her not to do so, because there were thousands of bad Commas, wild Question Marks and devious Semikoli, but the Little Blind Text didn’t listen. She packed her seven versalia, put her initial into the belt and made herself on the way. When she reached the first hills of the Italic Mountains, she had a last view back on the skyline of her hometown Bookmarksgrove, the headline of Alphabet Village and the subline of her own road, the Line Lane. Pityful a rethoric question ran over her cheek, then`;

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
  http.post(logoutURL)
  check(res, { 'logout status was 200': (r) => r.status == 200 });
  sleep(1)
  res = http.post(loginURL, JSON.stringify({email: email, password: password}), {headers: loginHeaders})
  check(res, {'user logged in (2nd time)': (r) => JSON.parse(r.body).name == name && r.cookies })
  sleep(1)

  // res = http.post(`${indexURL}/deleteIndex`)
  // console.log('deleteIndex: ', res.body)

  // create doc, submit some text, then search for it
  res = http.post(createURL, JSON.stringify({name: name}), {headers: loginHeaders}) // every VU creates its own doc for now
  console.log('res:', JSON.stringify(res))
  check(res, {'docid returned': (r) => !!JSON.parse(r.body).docid })
  let docID = JSON.parse(res.body).docid
  let clientID = name
  sleep(0.05)
  let op = [{ insert: `${lorem}` }]
  let version = 0
  res = http.post(`${opURL}/${docID}/${clientID}`, JSON.stringify({version: version, op: op}), {headers: loginHeaders})
  while (JSON.parse(res.body).status === 'retry') {
    version++
    sleep(0.05)
    res = http.post(`${opURL}/${docID}/${clientID}`, JSON.stringify({version: version, op: op}), {headers: loginHeaders})
  }
  check(res, { 'submitted op': (r) => JSON.parse(r.body).status === 'ok' })
  if (JSON.parse(res.body).status === 'ok') version++
  sleep(5)

  // now search
  res = http.get(`${searchURL}?q=philosophicaltahr%20defensivesnipe%20instantcuckoo`)
  check(res, {'got search results': (r) => r.body != '[]'}) // check nonempty body for now
  if (res.body == '[]') {
    console.log('empty search')
  } else {
    console.log('search res.body ', res.body)
  }
  res = http.get(`${suggestURL}?q=reducedseahor`) // VU&10, VU&11, etc. all possible matches that should be in there (assumeing numOps big enuf)
  check(res, {'got suggestions': (r) => r.body != '[]'})
  if (res.body == '[]') {
    console.log('empty suggest')
  } else {
    console.log('suggest res.body ', res.body)
  }

  // for (let i=0; i < numOps; i++) {
  //   op = [{ insert: `${name}&${i} ` }]
  //   res = http.post(`${opURL}/${docID}/${clientID}`, JSON.stringify({version: version, op: op}), {headers: loginHeaders})
  //   while (JSON.parse(res.body).status === 'retry') {
  //     version++
  //     sleep(0.05)
  //     res = http.post(`${opURL}/${docID}/${clientID}`, JSON.stringify({version: version, op: op}), {headers: loginHeaders})
  //   }
  //   check(res, { 'submitted op': (r) => JSON.parse(r.body).status === 'ok' })
  //   if (JSON.parse(res.body).status === 'ok') version++
  // }

  sleep(5)

}
