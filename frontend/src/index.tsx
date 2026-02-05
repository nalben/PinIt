import { createRoot } from "react-dom/client";
import App from './components/app/App';
import { createBrowserRouter, matchPath, Navigate, RouterProvider, useLocation } from "react-router-dom";
import { useEffect } from "react";
import Home from "@/pages/home/Home";
import Welcome from "./pages/welcome/Welcome";
import PublicRoute from "./components/__general/publicroute/PublicRoute";
import Profile from "./pages/profile/Profile";
import ProfileRedirect from "./components/__general/profileredirect/ProfileRedirect";
import Todo from "./pages/todo/Todo";
import Spaces from "./pages/spaces/Spaces";

const useDocumentTitle = (defaultTitle = "PinIt") => {
  const location = useLocation();

  useEffect(() => {
    const profileMatch = matchPath("/user/:username", location.pathname);

    if (profileMatch?.params?.username) {
      document.title = `${profileMatch.params.username} | PinIt`;
      return;
    }

    switch (location.pathname) {
      case "/":
      case "/welcome":
        document.title = "Welcome | PinIt";
        break;
      case "/home":
        document.title = "Home | PinIt";
        break;
      case "/spaces":
        document.title = "Spaces | PinIt";
        break;
      case "/todo":
        document.title = "Todo | PinIt";
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
            <Welcome />
          </PublicRoute>
        )
      },
      {
        path: "/welcome",
        element: (
          <PublicRoute>
            <Welcome />
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
        element: <Profile />
      },
      {
        path: "/home",
        element: <Home />
      },
      {
        path: "/todo",
        element: <Todo />
      },
      {
        path: "/spaces",
        element: <Spaces />
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
