import {createRoot} from "react-dom/client";
import App from './components/app/App'
import {createBrowserRouter, Navigate, RouterProvider} from "react-router-dom";
import { Suspense } from "react";
import { LazyHome} from "@/pages/home/Home.lazy";
import HomeSkeleton from "./pages/home/HomeSkeleton";
import WelcomeSkeleton from "./pages/welcome/WelcomeSkeleton";
import { LazyWelcome } from "./pages/welcome/Welcome.lazy";
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
                element: <Suspense fallback={<WelcomeSkeleton />}><LazyWelcome/></Suspense>
            },
            {
                path: '*',
                element: <Navigate to="/" replace />
            },
            {
                path: '/home',
                element: <Suspense fallback={<HomeSkeleton />}><LazyHome/></Suspense>
            },
            {
                path: '/welcome',
                element: <Suspense fallback={<WelcomeSkeleton />}><LazyWelcome/></Suspense>
            },
        ]
    },
]);

container.render(
    <RouterProvider router={router} />
)
