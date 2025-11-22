import FlowBoardContainer from '@/components/flow/FlowBoardContainer';
import classes from './Home.module.scss'
import React from 'react';
import FlowBoard from '@/components/flow/FlowBoard';


const Home = () => {



    return (
        <div className={classes.home}>
            <FlowBoard />
        </div>
        
    );
};

export default Home;