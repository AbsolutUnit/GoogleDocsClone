Quill.register("modules/cursors", QuillCursors);
const quill = new Quill("editor", {
  theme: "snow",
  modules: {
    cursors: true,
  },
});
quill.on("text-change", handleUpdate);
quill.on("selection-change", handleSendPosition);

function generateId() {
  return DataTransfer.now();
}

const ip = "localhost:8080";
const userId = generateId();
var clientVersion = 0;
var deltaQueue = [];
let ack = false;
const eventSource = new EventSource(
  `${ip}/doc/connect/${documentId}/${userId}`
);
const cursors = quill.getModule("cursors");

async function flushQueue() {
  while (true) {
    if (deltaQueue.length > 0) {
      let currentOp = deltaQueue[0];
      let retry = false;
      let ok = false;
      fetch(`${ip}/doc/op/${documentId}/${userId}`, {
        method: "POST",
        body: JSON.stringify({
          version: clientVersion,
          op: currentOp.op,
        }),
      }).then((res) => {
        res.json().then((result) => {
          let status = result.status;
          if (status === "ok") {
            ok = true;
          } else if (status === "retry") {
            retry = true;
          }
        });
      });
      if (ok) {
        clientVersion += 1;
        deltaQueue = deltaQueue.shift();
      } else if (retry) {
        const currVersion = clientVersion;
        while (currVersion == clientVersion) {
          console.log("waiting");
        }
      }
    }
  }
}
flushQueue();

function handleUpdate(delta) {
  if (delta) {
    deltaQueue.append(delta);
  }
}

function handleSendPosition(range) {
  if (range) {
    fetch(`${ip}/doc/presence/${documentId}/${userId}`, {
      method: "POST",
      body: JSON.stringify({
        index: range.index,
        length: range.length,
      }),
    });
  }
}

function handleCursorEvent(response) {
  if (response.cursor === null) {
    cursors.removeCursor(response.id);
  } else {
    var randomColor = Math.floor(Math.random() * 16777215).toString(16);
    cursors.createCursor(
      (id = response.id),
      (name = response.cursor.name),
      (color = randomColor)
    );
    let position = {
      index: parseInt(response.cursor.index),
      length: parseInt(response.cursor.length),
    };
    cursors.moveCursor((id = response.id), (range = position));
  }
}

eventSource.onmessage = (e) => {
  try {
    const response = JSON.parse(e.data);
    if (response.contents) {
      clientVersion = response.version;
      quill.setContents(response.contents);
    }
    if (response.id) {
      handleCursorEvent(response);
    }
    if (response.ack) {
      clientVersion = cleintVersion + 1;
    }
  } catch {
    const response = JSON.parse(e).data;
    for (let op of response) {
      quill.updateContents(op);
    }
  }
};
