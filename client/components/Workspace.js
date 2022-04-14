import React, { useState } from 'react';
import ReactQuill from 'react-quill';
import List from '@mui/material/List';
import { Typography } from '@mui/material'
import { GlobalStoreContext } from '../store/index.js'

// const ip = "http://backyardigans.cse356.compas.cs.stonybrook.edu"; 
const ip = "http://localhost:8080";

export default function WorkspaceScreen() {
    const [value, setValue] = useState('');
    const [connected, setConnected] = useState(false);
    const [eventStream, setEventStream] = useState(null);
    
    onChangeCallback = (content, delta, source, editor) => {
        if (delta) {
            delta.ops.map(function (operation) {
                    fetch(ip + "/doc/op/" + this.props.documentId, {
                        method: 'POST',
                        body: JSON.stringify({
                            "version": this.props.version,
                            "op": operation
                        })
                    });
                }
            );
        }
    }

    onChangeSelectionCallback = (range, source, editor) => {
        if (range) {
            let connectionUrl = ip + "/doc/presence/" + this.props.documentId + "/" + this.userId; 
            fetch(connectionUrl, {
                method: 'POST',
                body: JSON.stringify({
                    "index": range.index,
                    "length": range.length
                })
            });
            let john = new EventSource(connectionUrl);
            setEventStream(john);
        }
    }

    onConnectCallback = (docId) => {
        if (docId) {
            fetch(ip + "/doc/connect/" + docId + "/" + this.props.userId, {
                method: 'GET'
            });

        }
    }


    return (connected ?
        <ReactQuill
            theme = "snow"
            value = {value}
            onChange = {onChangeCallback}
            onChangeSelection = {onChangeSelectionCallback}
        /> : 
        //button with one form for docid
    )
}