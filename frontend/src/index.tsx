import { createRoot } from "react-dom/client";
import App from './components/app/App';
import { createBrowserRouter, Navigate, RouterProvider, useLocation } from "react-router-dom";
import { Suspense, useEffect } from "react";
import { LazyHome } from "@/pages/home/Home.lazy";
import HomeSkeleton from "./pages/home/HomeSkeleton";
import WelcomeSkeleton from "./pages/welcome/WelcomeSkeleton";
import { LazyWelcome } from "./pages/welcome/Welcome.lazy";
import PublicRoute from "./components/__general/publicroute/PublicRoute";
import { LazyProfile } from "./pages/profile/Profile.lazy";
import ProfileSkeleton from "./pages/profile/ProfileSkeleton";
import ProtectedRoute from "./components/__general/protectedroute/ProtectedRoute";
import ProfileRedirect from "./components/__general/profileredirect/ProfileRedirect";
import { LazyAbout } from "@/pages/about/About.lazy";
import AboutSkeleton from "./pages/about/AboutSkeleton";


const useDocumentTitle = (defaultTitle = 'PinIt') => {
  const location = useLocation();

  useEffect(() => {
    switch (location.pathname) {
      case '/':
      case '/welcome':
        document.title = 'Welcome | PinIt';
        break;
      case '/home':
        document.title = 'Home | PinIt';
        break;
      case '/profile':
        document.title = 'Profile | PinIt';
        break;
      default:
        document.title = defaultTitle;
    }
  }, [location.pathname, defaultTitle]);
};

const AppWithTitle = () => {
  useDocumentTitle();
  return <App />;
};


const router = createBrowserRouter([
  {
    path: "/",
    element: <AppWithTitle />,
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
        path: "/profile",
        element: <ProfileRedirect />
      },
      {
        path: "/user",
        element: <Navigate to="/home" replace />
      },
      {
        path: "/user/:username",
        element: (
          <Suspense fallback={<ProfileSkeleton />}>
            <LazyProfile />
          </Suspense>
        )
      },
      {
        path: "/home",
        element: (
          <Suspense fallback={<HomeSkeleton />}><LazyHome /></Suspense>
        )
      },
      {
        path: "/about",
        element: (
          <Suspense fallback={<AboutSkeleton />}><LazyAbout /></Suspense>
        )
      },
      {
        path: "*",
        element: <Navigate to="/" replace />
      }
    ]
  },
]);


const root = document.getElementById('root');
if (!root) throw new Error('root not found');

const container = createRoot(root);
container.render(
  <RouterProvider router={router} />
);
