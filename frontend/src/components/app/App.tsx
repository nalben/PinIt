import React from 'react';
import { Link, Outlet } from 'react-router-dom';
import classes from './App.module.scss';
import "@/styles/general.scss";
import "@/styles/fonts.scss";
import "@/styles/variables.scss";



const Root = () => (
    <div className={classes.sitecon}>
        <main className={classes.pagecontent}>
            <Outlet />
        </main>
    </div>
);


export default Root;