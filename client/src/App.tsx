import { BrowserRouter, Routes, Route } from "react-router-dom";
import SignUp from "./Auth/SignUp";
import Dashboard from "./Dashboard/Dashboard";
import SignIn from "./Auth/SignIn";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<SignIn/>} />
        <Route path="/login" element={<SignIn/>} />
        <Route path="/signup" element={<SignUp/>} />
        <Route path="/dashboard" element={<Dashboard/>} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;