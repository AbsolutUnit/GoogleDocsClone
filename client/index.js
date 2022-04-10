// quill setup
const quill = new Quill('#editor', {
    theme: 'snow'
});
quill.on('text-change', update); // might want editor-change

// connect to event stream
//const ip = "backyardigans.cse356.compas.cs.stonybrook.edu"; 
const ip = "localhost:8080";
const id = generateId();
const connUrl = "http://" + ip + "/connect/" + id;
const eventSource = new EventSource(connUrl);

// send new operation to server
function update(delta) {
    const contents = quill.getContents();
    console.log('(client side) contents', contents);
    if (delta) { // delta is the new change operation
        console.log('(client side) change', delta.ops)
        const opUrl = "http://" + ip + "/op/" + id;
        fetch(opUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify([delta.ops]) 
	    });
        console.log("(client side) ops", JSON.stringify([delta.ops]))
    }
}

const docbtn = document.getElementById("docbtn")
const getUrl = "http://" + ip + "/doc/" + id;
docbtn.onclick = (e) => {
    fetch(getUrl).then(res => {
        res.text().then(function(text) {
            console.log("body", text)
        })
    })
}
//login and logout buttons are for testing
const loginbtn = document.getElementById("loginbtn")
loginbtn.onclick = (e) => {
    let xhr = new XMLHttpRequest();
    xhr.open("POST", "http://localhost:8080/login");
    xhr.setRequestHeader("Accept", "application/json");
    xhr.setRequestHeader("Content-Type", "application/json");
    let data = {
        username: "bob",
        password: "the builder"
    };
    xhr.send(JSON.stringify(data));

    //why tf doesn't this work 
    // const params = {
    //     username: "bob",
    //     password: "the builder"
    // }
    // const options = {
    //     method: 'POST',
    //     body: JSON.stringify(params)
    // }
    // fetch('http://localhost:8080/login', options)
    // .then(response => response.json())
    // .then(response => {
    //     // Do something with response.
    // })
}

const logoutbtn = document.getElementById("logoutbtn")
logoutbtn.onclick = (e) => {
    console.log('logout hit!')
    let xhr = new XMLHttpRequest();
    xhr.open("POST", "http://localhost:8080/logout");
    xhr.setRequestHeader("Accept", "application/json");
    xhr.setRequestHeader("Content-Type", "application/json");
    let data = {
        something: "doesn't matter",
    };
    xhr.send(JSON.stringify(data));
}

// receive transforms from server and apply them to editor
eventSource.onmessage = (e) => {
    console.log("e.data", e.data)
    quill.updateContents(e.data);
};

function generateId() {
    return parseInt(Math.random() * 1000000000)
}
