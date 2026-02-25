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
import Board from "./pages/board/Board";
import { useBoardDetailsStore } from "@/store/boardDetailsStore";
import { useBoardsUnifiedStore } from "@/store/boardsUnifiedStore";

const useDocumentTitle = (defaultTitle = "PinIt") => {
  const location = useLocation();
  const boardMatch = matchPath({ path: "/spaces/:boardId", end: false }, location.pathname);
  const boardIdRaw = boardMatch?.params?.boardId;
  const boardId = typeof boardIdRaw === 'string' ? Number(boardIdRaw) : null;
  const safeBoardId = Number.isFinite(boardId) && (boardId as number) > 0 ? (boardId as number) : null;

  const unifiedTitle = useBoardsUnifiedStore((s) => (safeBoardId ? s.entitiesById[safeBoardId]?.title : null));
  const detailsTitle = useBoardDetailsStore((s) =>
    safeBoardId ? (s.boardMetaByBoardId[safeBoardId]?.title ?? null) : null
  );

  useEffect(() => {
    const profileMatch = matchPath("/user/:username", location.pathname);

    if (profileMatch?.params?.username) {
      document.title = `Profile | PinIt`;
      return;
    }

    if (safeBoardId) {
      const title = (typeof detailsTitle === 'string' && detailsTitle.trim() ? detailsTitle : null) ??
        (typeof unifiedTitle === 'string' && unifiedTitle.trim() ? unifiedTitle : null);

      document.title = title ? `${title} | PinIt` : "Board | PinIt";
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
  }, [location.pathname, defaultTitle, detailsTitle, safeBoardId, unifiedTitle]);
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
      // {
      //   path: "/todo",
      //   element: <Todo />
      // },
      {
        path: "/spaces",
        element: <Spaces />
      },
      {
        path: "/spaces/:boardId",
        element: <Board />
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
