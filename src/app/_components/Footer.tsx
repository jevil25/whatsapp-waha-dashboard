export default function Footer() {
  return (
    <footer className="mt-auto border-t bg-gray-50 py-6">
      <div className="container mx-auto px-4">
        <div className="flex flex-col items-center justify-center space-y-4 text-center">
          <div className="flex items-center space-x-2 text-gray-600">
            <span>Made by Aaron with</span>
            <span className="text-red-500">❤️</span>
            <span>💻</span>
          </div>
          
          <div className="flex items-center space-x-6">
            <a
              href="https://github.com/jevil25"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-2 text-gray-600 transition-colors hover:text-gray-900"
            >
              <span>🐙</span>
              <span>GitHub</span>
            </a>
            
            <a
              href="https://www.youtube.com/@JevilCodes"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-2 text-gray-600 transition-colors hover:text-red-600"
            >
              <span>📺</span>
              <span>YouTube</span>
            </a>
            
            <a
              href="https://x.com/jevil257"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-2 text-gray-600 transition-colors hover:text-blue-500"
            >
              <span>🐦</span>
              <span>X</span>
            </a>
          </div>
          
          <div className="text-sm text-gray-500">
            <span>© {new Date().getFullYear()} WhatsApp Group Manager</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
