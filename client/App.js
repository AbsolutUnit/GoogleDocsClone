import React from 'react';
import './App.css';

import Header from './components/Header.js';
import Workspace from './components/Workspace.js';
import LoginScreen from './components/LoginScreen.js';

// const ip = "http://backyardigans.cse356.compas.cs.stonybrook.edu"; 
const ip = "http://localhost:8080"

class App extends React.Component {
    constructor(props) {
        super(props);

        this.state = {
            loggedIn : false,
            workspace : false,
            documentId : None,
            userId : Date.now(),
            version : 0
        }
    }

    render() {
        return (
            <div id = "app-root">
                <Header
                    title = 'Top Bar'
                    {...this.state}
                />
                {this.state.loggedIn ? <Workspace {...this.state}/> : <LoginScreen {...this.state}/>}
            </div>
        )
    }
    // }

    // inputRegister = (name, email, password) => {
    //     if (name && email && password) {
    //         fetch(ip + "/users/signup", {
    //             method: 'POST',
    //             body: JSON.stringify({"name" : name, "email" : email, "password" : password})
    //         });
    //     }
    // }

    // inputLogin = (email, password) => {
    //     if (email && password) {
    //         fetch(ip + "/users/login", {
    //             method: 'POST',
    //             body: JSON.stringify({"email": email, "password": password})
    //         });
    //     }
    // }

    // inputLogout = ()
}