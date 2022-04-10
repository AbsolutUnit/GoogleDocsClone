
// quill setup
const quill = new Quill('#editor', {
    theme: 'snow',
    modules: {
        cursors: true,
    }
});
quill.on('text-change', update); // might want editor-change
quill.on('selection-change', sendPosition);

// connect to event stream
const ip = "backyardigans.cse356.compas.cs.stonybrook.edu"; 
const id = generateId();
const connUrl = "http://" + ip + "/connect/" + id;
const eventSource = new EventSource(connUrl);
const cursors = quill.getModule('cursors');

function generateId() {
    return Date.now();
}

// send new operation to server
function update(delta) {
    const contents = quill.getContents();
    console.log('(client side) contents', contents);
    if (delta) { // delta is the new change operation
        console.log('(client side) change', delta);
        const opUrl = "http://" + ip + "/op/" + id;
        fetch(opUrl, {
            method: 'POST',
            body: JSON.stringify(delta.ops) // M1 needed [delta.ops]
        });
    }
}

function setCursors (response) {
    if (response.index) {
        quill.setSelection(index = parseInt(response.index), length = parseInt(response.length));
    } else {
        for (let cursor in response) {
            var randomColor = Math.floor(Math.random() * 16777215).toString(16);
            cursors.createCursor(id = cursor, color = randomColor);
            let movement = {"index": parseInt(cursor.index), "length": parseInt(cursor.length)};
            cursors.moveCursor(id = cursor, range = movement);
        }
    }
}

function sendPosition(range) {
    const presUrl = "http://" + ip + "/presence/" + id;
    if (range) {
        console.log("Client side: " + range);
        fetch(presUrl, {
            method: 'POST',
            body: JSON.stringify(range)
        });
    } else {
        console.log("Client side: Out of focus");
        fetch(presUrl, {
            method: 'POST',
            body: JSON.stringify(null)
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
    try {
        const response = JSON.parse(e.data);
        if (response.contents) {
            // for whole doc
            quill.updateContents(response.contents);
        } else {
            // for cursor update

        }
    } catch {
        // for op
        const actions = JSON.parse(e).data;
        for (let operation of actions) {
            quill.updateContents(operation);
        }
    }
};