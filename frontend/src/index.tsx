import {createRoot} from "react-dom/client";
import App from './components/app/App'
import {createBrowserRouter, Navigate, RouterProvider} from "react-router-dom";
import { Suspense } from "react";
import { LazyHome} from "@/pages/home/Home.lazy";
import HomeSkeleton from "./pages/home/HomeSkeleton";
const root = document.getElementById('root');

if (!root) {
    throw new Error('root not found');
}

const container = createRoot(root);

const router = createBrowserRouter([
    {
        path: "/",
        element: <App />,
        children: [
            {
                index: true,
                element: <Suspense fallback={<HomeSkeleton />}><LazyHome/></Suspense>
            },
            {
                path: '*',
                element: <Navigate to="/" replace />
            },
            {
                path: '/home',
                element: <Suspense fallback={<HomeSkeleton />}><LazyHome/></Suspense>
            },            
        ]
    },
]);

container.render(
    <RouterProvider router={router} />
)
