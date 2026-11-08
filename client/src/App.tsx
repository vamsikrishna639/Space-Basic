import { createBrowserRouter, Navigate, RouterProvider } from 'react-router';
import { Welcome } from './screens/auth/Welcome';
import { SignIn } from './screens/auth/SignIn';

const router = createBrowserRouter([
  { path: '/', element: <Welcome /> },
  { path: '/sign-in/:method', element: <SignIn /> },
  { path: '/sign-in', element: <Navigate to="/sign-in/email" replace /> },
  { path: '*', element: <Navigate to="/" replace /> },
]);

export function App() {
  return <RouterProvider router={router} />;
}
