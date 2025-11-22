import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './components/app/App'
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { Suspense } from "react";
import { LazyHome } from "@/pages/home/Home.lazy";
import HomeSkeleton from "./pages/home/HomeSkeleton";
import ScrollToTop from './components/__general/scroll/Scrolltotop';


const root = document.getElementById('root');
if (!root) throw new Error('root not found');
const container = createRoot(root);

container.render(
    <HashRouter>
        <ScrollToTop />
        <Routes>
            <Route path="/" element={<App />}>
            <Route index element={<Navigate to="/home" replace />} />
            <Route path="home" element={
                <Suspense fallback={<HomeSkeleton />}>
                <LazyHome />
                </Suspense>
            } />
            <Route path="*" element={<Navigate to="/home" replace />} />
            </Route>
        </Routes>
    </HashRouter>

);










// import {createRoot} from "react-dom/client";
// import App from './components/app/App'
// import {createBrowserRouter, Navigate, RouterProvider} from "react-router-dom";
// import { Suspense } from "react";
// import { LazyHome} from "@/pages/home/Home.lazy";
// import HomeSkeleton from "./pages/home/HomeSkeleton";
// import { LazyServices } from "./pages/services/services.Lazy";
// const root = document.getElementById('root');

// if (!root) {
//     throw new Error('root not found');
// }

// const container = createRoot(root);

// const router = createBrowserRouter([
//     {
//         path: "/",
//         element: <App />,
//         children: [
//             {
//                 index: true,
//                 element: <Suspense fallback={<HomeSkeleton />}><LazyHome/></Suspense>
//             },
//             {
//                 path: '*',
//                 element: <Navigate to="/" replace />
//             },
//             {
//                 path: '/home',
//                 element: <Suspense fallback={<HomeSkeleton />}><LazyHome/></Suspense>
//             },
//             {
//                 path: '/services',
//                 element: <Suspense fallback={<HomeSkeleton />}><LazyServices/></Suspense>
//             },
            
//         ]
//     },
// ]);






// container.render(
//     <RouterProvider router={router} />
// )
