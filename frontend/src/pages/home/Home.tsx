import FlowBoardContainer from '@/components/flow/FlowBoardContainer';
import classes from './Home.module.scss'
import React from 'react';
import FlowBoard from '@/components/flow/FlowBoard';
import Mainbtn from '@/components/_UI/mainbtn/Mainbtn';


const Home = () => {



    return (
        <div className={classes.home}>
            <main className={classes.home_container}>
                <div className={classes.left}>
                    <section className={classes.welcome_container}>
                        <h1>Добро пожаловать в PinIt</h1>
                        <h2>Создайте свою доску или присоединяйтесь к доскам своих друзей</h2>
                        <Mainbtn
                            text='Создать доску'
                        />
                    </section>
                    <div className={classes.interact_container}>
                        <section className={classes.desks_container}>
                            <h2>последние открытые доски:</h2>
                            <div className={classes.desks_list}>
                                <div className={classes.desks_item}>
                                    <img src="" alt="" />
                                    <h3>название</h3>
                                    <p>описание</p>
                                    <Mainbtn
                                        text='открыть'
                                    />
                                </div>
                            </div>
                            or if epmty
                            <div className={classes.desks_empty}>
                                <h2>Досок не найдено</h2>
                                <Mainbtn
                                    text='Создать доску'
                                />
                            </div>
                        </section>
                        <section className={classes.friends_container}>
                            <h2>Друзья:</h2>
                            <div className={classes.friends_list}>
                                <div className={classes.friends_item}>
                                    img name open
                                </div>
                            </div>
                        </section>
                        <section className={classes.invites_container}>

                        </section>
                    </div>
                </div>
                <div className={classes.right}>

                </div>
            </main>
        </div>
        
    );
};

export default Home;