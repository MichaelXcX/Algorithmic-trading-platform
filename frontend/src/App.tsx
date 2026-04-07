import React from 'react'
import { Routes, Route } from 'react-router-dom'
import { SidebarUnfoldableExample } from './components/sidebar' 
import { CContainer } from '@coreui/react'
import '@coreui/coreui/dist/css/coreui.min.css'

// IMPORTĂM PAGINILE TALE REALE
import Portofolio from './pages/Portofolio'
import StockForcasting from './pages/Stock_Forcasting'
import PoliticalNews from './pages/Political_News'
import InvestmentNews from './pages/Investment_News'
import Help from './pages/Help'
import About from './pages/About'
import Contact from './pages/Contact'

const App: React.FC = () => {
  return (
    <div className="d-flex min-vh-100 bg-dark text-white" data-coreui-theme="dark">
      <SidebarUnfoldableExample />

      <div className="flex-grow-1 bg-body text-body">
        <header className="p-3 bg-dark border-bottom border-secondary shadow-sm">
          <CContainer fluid>
            <h4 className="m-0 text-white">Algorithmic Trading Platform</h4>
          </CContainer>
        </header>

        <CContainer fluid className="mt-4">
          <Routes>
            <Route path="/" element={
              <div className="p-4 bg-dark border border-secondary rounded">
                <h1 className="text-white">Main Page</h1>
                <p className="text-light-emphasis">Selectați o opțiune din meniu.</p>
              </div>
            } />

            {/* Rutele trebuie să fie IDENTICE cu cele din sidebar.tsx */}
            <Route path="/portofolio" element={<Portofolio />} />
            <Route path="/stock_forcasting" element={<StockForcasting />} />
            <Route path="/political_news" element={<PoliticalNews />} />
            <Route path="/investment_news" element={<InvestmentNews />} />
            <Route path="/help" element={<Help />} />
            <Route path="/about" element={<About />} />
            <Route path="/contact" element={<Contact />} />
            
            <Route path="*" element={<div className="p-4 bg-dark border border-secondary rounded"><h1>404 - Not Found</h1></div>} />
          </Routes>
        </CContainer>
      </div>
    </div>
  )
}

export default App