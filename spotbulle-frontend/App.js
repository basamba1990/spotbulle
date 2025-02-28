import React from "react";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import Navbar from "./components/Navbar";
import UploadPitch from "./components/UploadPitch";

const App = () => {
  return (
    <Router>
      <div className="App">
        <Navbar />
        <Routes>
          <Route path="/upload" element={<UploadPitch />} />
          <Route path="/" element={<h1 className="text-center mt-8">Welcome to Spot Bulle</h1>} />
        </Routes>
      </div>
    </Router>
  );
};

export default App;
