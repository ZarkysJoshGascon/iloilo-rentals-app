export default function Aboutpage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <div className="bg-gradient-to-r from-[#2d568e] to-[#1e3a5f] text-white py-20">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <h1 className="text-5xl md:text-6xl font-bold mb-4">About Iloilo Rentals</h1>
          <p className="text-xl md:text-2xl text-white/90 max-w-2xl mx-auto leading-relaxed">
            Your trusted partner for premium condo rentals in Iloilo City
          </p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-16">
        {/* Main Content */}
        <div className="grid md:grid-cols-3 gap-8 mb-16">
          <div className="md:col-span-2">
            <div className="bg-white rounded-2xl shadow-lg p-8 md:p-10">
              <h2 className="text-3xl md:text-4xl font-bold text-[#2d568e] mb-6">Our Story</h2>
              <p className="text-gray-700 text-base md:text-lg mb-5 leading-relaxed">
                Iloilo Rentals was founded with a simple vision: to provide travelers and business professionals 
                with comfortable, well-maintained, and conveniently located accommodations at competitive prices.
              </p>
              <p className="text-gray-700 text-base md:text-lg mb-5 leading-relaxed">
                We carefully select each property in our portfolio, ensuring they meet our high standards for 
                quality, cleanliness, and location. Our properties are situated in prime areas including Megaworld, 
                Atria Park District, and near the famous Iloilo River Esplanade.
              </p>
              <p className="text-gray-700 text-base md:text-lg leading-relaxed">
                Whether you're visiting Iloilo for business or pleasure, we have the perfect place for you to call home. 
                Our team is dedicated to making your stay memorable and hassle-free.
              </p>
            </div>
          </div>
          
          <div>
            <div className="bg-white rounded-2xl shadow-lg p-8 md:p-10">
              <h2 className="text-3xl md:text-4xl font-bold text-[#2d568e] mb-6">Why Choose Us</h2>
              <div className="space-y-6">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-3xl text-[#2d568e]">✓</span>
                    <h3 className="text-xl font-semibold text-gray-800">Prime Locations</h3>
                  </div>
                  <p className="text-gray-600 text-base pl-10">All units near business districts, malls, and esplanade</p>
                </div>
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-3xl text-[#2d568e]">✓</span>
                    <h3 className="text-xl font-semibold text-gray-800">Quality Assured</h3>
                  </div>
                  <p className="text-gray-600 text-base pl-10">Every property is verified and well-maintained</p>
                </div>
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-3xl text-[#2d568e]">✓</span>
                    <h3 className="text-xl font-semibold text-gray-800">24/7 Support</h3>
                  </div>
                  <p className="text-gray-600 text-base pl-10">Local team ready to assist you anytime</p>
                </div>
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-3xl text-[#2d568e]">✓</span>
                    <h3 className="text-xl font-semibold text-gray-800">Best Price Guarantee</h3>
                  </div>
                  <p className="text-gray-600 text-base pl-10">Competitive rates with no hidden fees</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Section */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-16">
          <div className="bg-white rounded-2xl p-8 text-center shadow-md hover:shadow-lg transition">
            <div className="text-5xl md:text-6xl font-bold text-[#2d568e] mb-2">50+</div>
            <p className="text-gray-600 text-base">Happy Guests</p>
          </div>
          <div className="bg-white rounded-2xl p-8 text-center shadow-md hover:shadow-lg transition">
            <div className="text-5xl md:text-6xl font-bold text-[#2d568e] mb-2">3</div>
            <p className="text-gray-600 text-base">Premium Condos</p>
          </div>
          <div className="bg-white rounded-2xl p-8 text-center shadow-md hover:shadow-lg transition">
            <div className="text-5xl md:text-6xl font-bold text-[#2d568e] mb-2">5★</div>
            <p className="text-gray-600 text-base">Guest Rating</p>
          </div>
          <div className="bg-white rounded-2xl p-8 text-center shadow-md hover:shadow-lg transition">
            <div className="text-5xl md:text-6xl font-bold text-[#2d568e] mb-2">24/7</div>
            <p className="text-gray-600 text-base">Support</p>
          </div>
        </div>

        {/* Mission & Vision */}
        <div className="grid md:grid-cols-2 gap-8">
          <div className="bg-gradient-to-br from-[#2d568e]/10 to-transparent rounded-2xl p-8 border border-[#2d568e]/30">
            <h3 className="text-2xl md:text-3xl font-bold text-[#2d568e] mb-4">Our Mission</h3>
            <p className="text-gray-700 text-base md:text-lg leading-relaxed">
              To provide exceptional accommodation experiences that make every guest feel at home, 
              while supporting the growth of tourism in Iloilo City.
            </p>
          </div>
          <div className="bg-gradient-to-br from-[#2d568e]/10 to-transparent rounded-2xl p-8 border border-[#2d568e]/30">
            <h3 className="text-2xl md:text-3xl font-bold text-[#2d568e] mb-4">Our Vision</h3>
            <p className="text-gray-700 text-base md:text-lg leading-relaxed">
              To become Iloilo's most trusted and preferred short-term rental platform, known for quality, 
              reliability, and exceptional customer service.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}