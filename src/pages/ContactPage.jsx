export default function ContactPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-16">
      <h1 className="text-4xl font-bold text-[#2d568e] mb-6">Contact Us</h1>
      <div className="bg-white rounded-lg shadow-md p-8">
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-2">Email</h2>
          <p className="text-gray-600">info@iloilorentals.com</p>
        </div>
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-2">Phone</h2>
          <p className="text-gray-600">+63 (33) 123-4567</p>
        </div>
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-2">Address</h2>
          <p className="text-gray-600">Megaworld Boulevard, Iloilo City, Philippines 5000</p>
        </div>
        <div>
          <h2 className="text-xl font-semibold mb-2">Business Hours</h2>
          <p className="text-gray-600">Monday - Friday: 9:00 AM - 6:00 PM</p>
          <p className="text-gray-600">Saturday: 10:00 AM - 4:00 PM</p>
          <p className="text-gray-600">Sunday: Closed</p>
        </div>
      </div>
    </div>
  )
}