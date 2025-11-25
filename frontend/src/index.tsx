import { createRoot } from "react-dom/client";
import App from './components/app/App';
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import { Suspense } from "react";
import { LazyHome } from "@/pages/home/Home.lazy";
import HomeSkeleton from "./pages/home/HomeSkeleton";
import WelcomeSkeleton from "./pages/welcome/WelcomeSkeleton";
import { LazyWelcome } from "./pages/welcome/Welcome.lazy";
import PublicRoute from "./components/__general/publicroute/PublicRoute";
import ProtectedRoute from "./components/__general/protectedroute/ProtectedRoute";

const root = document.getElementById('root');
if (!root) throw new Error('root not found');

const container = createRoot(root);

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      {
        index: true,
        element: (
          <PublicRoute>
            <Suspense fallback={<WelcomeSkeleton />}><LazyWelcome /></Suspense>
          </PublicRoute>
        )
      },
      {
        path: "/welcome",
        element: (
          <PublicRoute>
            <Suspense fallback={<WelcomeSkeleton />}><LazyWelcome /></Suspense>
          </PublicRoute>
        )
      },
      {
        path: "/home",
        element: (
            <Suspense fallback={<HomeSkeleton />}><LazyHome /></Suspense>
        )
      },
      {
        path: "*",
        element: <Navigate to="/" replace />
      }
    ]
  },
]);

container.render(
  <RouterProvider router={router} />
);
