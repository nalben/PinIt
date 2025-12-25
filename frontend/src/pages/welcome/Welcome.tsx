import FlowBoardContainer from '@/components/flow/FlowBoardContainer';
import classes from './Welcome.module.scss'
import React from 'react';
import FlowBoard from '@/components/flow/FlowBoard';
import AuthTrigger from '@/components/auth/AuthTrigger';
import Mainbtn from '@/components/_UI/mainbtn/Mainbtn';
import back from '@/assets/img/back.jpg'

const Welcome = () => {



    return (
        <section className={classes.welcome}>
            <div
                className={classes.container}
                style={{
                    // backgroundImage: `url(${back})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    backgroundRepeat: 'no-repeat',
                }}
            >
                <div className={classes.headline}>
                    <h1>PinIt — Your Idea Board</h1>
                    <h2>Sign in or create an account to start connecting your notes.</h2>
                </div>
                <div className={classes.buttons}>
                    <AuthTrigger type="login">
                        <Mainbtn
                        text='login'
                        type='button'
                        variant='auth'
                        />
                    </AuthTrigger>
                    <AuthTrigger type="register"
                    closeOnOverlayClick={false}
                    >
                        <Mainbtn
                        text='register'
                        type='button'
                        variant='auth'
                        />
                    </AuthTrigger>
                </div>
            </div>
        </section>
        
    );
};

export default Welcome;