import React from "react";    
import { Link } from "react-router-dom";    
    
const Navbar = () => {    
  return (    
    <nav className="bg-blue-600 p-4">    
      <div className="container mx-auto flex justify-between items-center">    
        <Link to="/" className="text-white text-xl font-bold">    
          Spot Bulle    
        </Link>    
        <div className="flex space-x-4">    
          <Link to="/upload" className="text-white hover:text-gray-200">    
            Upload Pitch    
          </Link>    
          <Link to="/profile" className="text-white hover:text-gray-200">    
            Profile    
          </Link>    
        </div>    
      </div>    
    </nav>    
  );    
};    
    
export default Navbar;
