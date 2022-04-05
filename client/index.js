// quill setup
const quill = new Quill('#editor', {
    theme: 'snow'
});
quill.on('text-change', update); // might want editor-change
update();

// connect to event stream
const ip = "backyardigans.cse356.compas.cs.stonybrook.edu"; 
const id = generateId();
const connUrl = "http://" + ip + "/connect/" + id;
const eventSource = new EventSource(connUrl);

// send new operation to server
function update(delta) {
    const contents = quill.getContents();
    console.log('(client side) contents', contents);
    if (delta) { // delta is the new change operation
        console.log('(client side) change', delta)
        const opUrl = "http://" + ip + "/op/" + id;
        fetch(opUrl, {
            method: 'POST',
            body: JSON.stringify(delta.ops) 
	});
    }
}

const docbtn = document.getElementById("docbtn")
const getUrl = "http://" + ip + "/doc/" + id;
docbtn.onclick = (e) => {
    console.log("clicked")
    fetch(getUrl).then(res => {
	res.text().then(function (text) {
	    console.log('body: '+ text)	    
	})
    })
}

// receive transforms from server and apply them to editor
eventSource.onmessage = (e) => {
    quill.updateContents(e.data);
};

function generateId() {
    return parseInt(Math.random() * 1000000000)
}