import { defineComponents } from 'blume'
import ReportError from './components/ReportError.astro'
import ThemedHeader from './components/ThemedHeader.astro'

export default defineComponents({ layout: { Header: ThemedHeader, PageHeader: ReportError } })
