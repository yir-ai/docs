import { defineComponents } from 'blume'
import ReportError from './components/ReportError.astro'
import SiteHeader from './components/SiteHeader.astro'

export default defineComponents({ layout: { Header: SiteHeader, PageHeader: ReportError } })
