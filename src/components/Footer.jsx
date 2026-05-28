import { Link } from 'react-router-dom'

export default function Footer() {
  return (
    <footer className="bg-gray-800 text-white py-8">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-6">
          <div className="text-center md:text-left">
            <h3 className="text-lg font-semibold mb-1">Iloilo Rentals</h3>
            <p className="text-gray-400 text-sm">Premium condo rentals in Iloilo City</p>
          </div>
          
          <div className="flex flex-wrap justify-center gap-6">
            <Link to="/about" className="text-gray-400 hover:text-white transition text-sm">About Us</Link>
            <Link to="/contact" className="text-gray-400 hover:text-white transition text-sm">Contact Us</Link>
            <Link to="/privacy" className="text-gray-400 hover:text-white transition text-sm">Privacy Policy</Link>
            <Link to="/terms" className="text-gray-400 hover:text-white transition text-sm">Terms & Conditions</Link>
          </div>
        </div>
        
        <div className="border-t border-gray-700 pt-6 text-center">
          <p className="text-gray-400 text-sm">© 2025 Iloilo Rentals. All rights reserved.</p>
          <p className="text-gray-500 text-xs mt-2">Connecting You to the Best Rentals in Iloilo</p>
        </div>
      </div>
    </footer>
  )
}