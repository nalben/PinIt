import FlowBoardContainer from '@/components/flow/FlowBoardContainer';
import classes from './Welcome.module.scss'
import React from 'react';
import FlowBoard from '@/components/flow/FlowBoard';


const Welcome = () => {



    return (
        <div className={classes.Welcome}>
            <h1>PinIt — Your Idea Board</h1>
            <h1>Sign in or create an account to start connecting your notes.</h1>
        </div>
        
    );
};

export default Welcome;