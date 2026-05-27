import {
  CSidebar,
  CSidebarBrand,
  CSidebarHeader,
  CSidebarNav,
  CNavGroup,
  CNavLink,
  CNavItem,
  CNavTitle,
} from '@coreui/react'
import { NavLink } from 'react-router-dom'
import CIcon from '@coreui/icons-react'
import {
  cilStorage,
  cilMemory,
  cilNewspaper,
  cilAddressBook,
  cilBook,
  cilNotes,
  cilSpreadsheet,
  cilGraph,
  cilSettings,
} from '@coreui/icons'

export const SidebarUnfoldableExample = () => {
  return (
    <CSidebar className="border-end" unfoldable>
      <CSidebarHeader className="border-bottom">
        <CSidebarBrand>ATP</CSidebarBrand>
      </CSidebarHeader>
      <CSidebarNav>
        <CNavTitle>Dashboard</CNavTitle>

        <CNavItem>
          <CNavLink as={NavLink} to="/">
            <CIcon customClassName="nav-icon" icon={cilSpreadsheet} /> Home
          </CNavLink>
        </CNavItem>

        <CNavItem>
          <CNavLink as={NavLink} to="/portofolio">
            <CIcon customClassName="nav-icon" icon={cilStorage} /> Portofolio
          </CNavLink>
        </CNavItem>

        <CNavItem>
          <CNavLink as={NavLink} to="/stock_forcasting">
            <CIcon customClassName="nav-icon" icon={cilMemory} /> Stock Forcasting
          </CNavLink>
        </CNavItem>

        <CNavGroup
          toggler={
            <>
              <CIcon customClassName="nav-icon" icon={cilNewspaper} /> News
            </>
          }
        >
          <CNavItem>
            <CNavLink as={NavLink} to="/political_news">
              <span className="nav-icon"><span className="nav-icon-bullet"></span></span> Political
            </CNavLink>
          </CNavItem>

          <CNavItem>
            <CNavLink as={NavLink} to="/investment_news">
              <span className="nav-icon"><span className="nav-icon-bullet"></span></span> Investment
            </CNavLink>
          </CNavItem>
        </CNavGroup>

        <CNavTitle>ML Trading</CNavTitle>

        <CNavItem>
          <CNavLink as={NavLink} to="/signal_classifier">
            <CIcon customClassName="nav-icon" icon={cilGraph} /> Signal Classifier
          </CNavLink>
        </CNavItem>

        <CNavItem>
          <CNavLink as={NavLink} to="/strategy_selector">
            <CIcon customClassName="nav-icon" icon={cilSettings} /> Strategy Selector
          </CNavLink>
        </CNavItem>

        <CNavItem>
          <CNavLink as={NavLink} to="/models">
            <CIcon customClassName="nav-icon" icon={cilLayers} /> Models
          </CNavLink>
        </CNavItem>

        <CNavItem>
          <CNavLink as={NavLink} to="/help">
            <CIcon customClassName="nav-icon" icon={cilBook} /> Help
          </CNavLink>
        </CNavItem>

        <CNavItem>
          <CNavLink as={NavLink} to="/about">
            <CIcon customClassName="nav-icon" icon={cilNotes} /> About
          </CNavLink>
        </CNavItem>

        <CNavItem>
          <CNavLink as={NavLink} to="/contact">
            <CIcon customClassName="nav-icon" icon={cilAddressBook} /> Contact
          </CNavLink>
        </CNavItem>
      </CSidebarNav>
    </CSidebar>
  )
}
