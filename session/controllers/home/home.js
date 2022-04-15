
const ip = "http://localhost:8081";

function handleSubmitDocId(text){
    if (text) {
        fetch(ip + "/collection/create", {
            method: 'POST',
            body: JSON.stringify({
                docid: text
            })
        });
    } else {
        console.log("Error reaching server");
    }
}

function renderHyperLinks() {
    
}