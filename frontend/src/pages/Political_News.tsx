import React from 'react'
import { SidebarUnfoldableExample } from '../components/sidebar' 
import { CContainer } from '@coreui/react'
import '@coreui/coreui/dist/css/coreui.min.css'

const App: React.FC = () => {
  return (
    <div className="d-flex min-vh-100 bg-dark text-white" data-coreui-theme="dark">
      
      {/* 1. Sidebar-ul tău */}
      <SidebarUnfoldableExample />

      {/* 2. Zona principală de conținut */}
      <div className="flex-grow-1 bg-body text-body">
        

        <CContainer fluid className="mt-4">
          {/* Un container de tip Card dar adaptat la tema dark */}
          <div className="p-4 bg-dark border border-secondary rounded">
            <h1 className="text-white">Political News</h1>
            <p className="text-light-emphasis">
              Stiri despre politica
            </p>
          </div>
        </CContainer>
      </div>

    </div>
  )
}

export default App