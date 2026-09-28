import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'

interface CvatPage<T> {
  count: number
  next: string | null
  results: T[]
}

interface CvatProject {
  id: number
  name: string
  status: string
  dimension: string
  created_date: string
  updated_date: string
  tasks?: { count?: number }
}

interface CvatTask {
  id: number
  name: string
  project_id: number
  project_name: string
  status: string
  subset: string
  size: number
  media_type: string
  created_date: string
  updated_date: string
  owner?: { username?: string } | null
  assignee?: { username?: string } | null
  jobs?: {
    count?: number
    completed?: number
    validation?: number
  }
}

interface CvatJob {
  id: number
  name?: string
  status: string
  stage: string
  state: string
  start_frame?: number
  stop_frame?: number
  frame_count?: number
}

export interface CvatJobStateCounts {
  new: number
  inProgress: number
  completed: number
  rejected: number
  other: number
}

export interface CvatTaskSummary {
  id: number
  name: string
  projectId: number
  projectName: string
  status: string
  subset: string
  size: number
  mediaType: string
  jobs: number
  jobIds: number[]
  jobNames: string[]
  completedJobs: number
  jobStates: CvatJobStateCounts
  assignee: string | null
  updatedAt: string
}

export interface CvatProjectSummary {
  id: number
  name: string
  status: string
  dimension: string
  taskCount: number
  imageCount: number
  jobs: number
  completedJobs: number
  jobStates: CvatJobStateCounts
  updatedAt: string
  tasks: CvatTaskSummary[]
}

export interface CvatOverview {
  baseUrl: string
  fetchedAt: string
  totals: {
    projects: number
    tasks: number
    images: number
    jobs: number
    completedJobs: number
  }
  projects: CvatProjectSummary[]
}

export interface CvatImageBox {
  label: string
  labelCode: string
  labelName: string
  labelId: number
  type: string
  points: number[]
}

export interface CvatImageRecord {
  code: string
  annotationCode: string
  taskId: number
  taskName: string
  projectId: number
  projectName: string
  frame: number
  filename: string
  width: number
  height: number
  taskStatus: string
  jobStatus: string
  jobStatuses: string[]
  jobNames: string[]
  jobId: number | null
  jobName: string | null
  jobFrame: number | null
  jobPosition: number | null
  jobFrameCount: number | null
  boxes: CvatImageBox[]
}

export interface CvatImageFilters {
  search?: string
  projectId?: string
  taskId?: string
  label?: string
  status?: string
  jobStatus?: string
  jobSearch?: string
  box?: string
}

export interface CvatImageReport {
  items: CvatImageRecord[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  filters: {
    projects: Array<{ id: number, name: string }>
    tasks: Array<{ id: number, name: string, projectId: number }>
    labels: string[]
  }
}

interface CvatConfig {
  baseUrl: string
  username: string
  password: string
  rejectUnauthorized: boolean
}

function getCvatConfig(): CvatConfig {
  const runtimeConfig = useRuntimeConfig() as { cvat?: Partial<CvatConfig> }
  const baseUrl = String(runtimeConfig.cvat?.baseUrl || process.env.CVAT_BASE_URL || '').trim().replace(/\/+$/, '')
  const username = String(runtimeConfig.cvat?.username || process.env.CVAT_USERNAME || '').trim()
  const password = String(runtimeConfig.cvat?.password || process.env.CVAT_PASSWORD || '')
  const rejectUnauthorized = String(process.env.CVAT_TLS_REJECT_UNAUTHORIZED || 'true').toLowerCase() !== 'false'

  if (!baseUrl || !username || !password) {
    throw new Error('CVAT integration is not configured. Set CVAT_BASE_URL, CVAT_USERNAME, and CVAT_PASSWORD.')
  }

  return { baseUrl, username, password, rejectUnauthorized }
}

function requestCvat<T>(config: CvatConfig, pathOrUrl: string) {
  const url = new URL(pathOrUrl, `${config.baseUrl}/`).toString()
  const request = url.startsWith('https:') ? httpsRequest : httpRequest

  return new Promise<T>((resolve, reject) => {
    const clientRequest = request(url, {
      method: 'GET',
      headers: {
        Accept: 'application/vnd.cvat+json, application/json',
        Authorization: `Basic ${Buffer.from(`${config.username}:${config.password}`).toString('base64')}`
      },
      ...(url.startsWith('https:') ? { rejectUnauthorized: config.rejectUnauthorized } : {})
    }, (response) => {
      const chunks: Buffer[] = []
      response.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
      response.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8')
        if ((response.statusCode || 500) === 401 || (response.statusCode || 500) === 403) {
          reject(new Error('CVAT authentication failed. Check CVAT_USERNAME and CVAT_PASSWORD.'))
          return
        }
        if ((response.statusCode || 500) < 200 || (response.statusCode || 500) >= 300) {
          reject(new Error(`CVAT API request failed with HTTP ${response.statusCode || 500}.`))
          return
        }
        try {
          resolve(JSON.parse(body) as T)
        } catch {
          reject(new Error('CVAT returned an invalid JSON response.'))
        }
      })
    })
    clientRequest.on('error', (error) => reject(new Error(`Unable to connect to CVAT: ${error.message}`)))
    clientRequest.end()
  })
}

function requestCvatBinary(config: CvatConfig, pathOrUrl: string) {
  const url = new URL(pathOrUrl, `${config.baseUrl}/`).toString()
  const request = url.startsWith('https:') ? httpsRequest : httpRequest

  return new Promise<{ content: Buffer, contentType: string }>((resolve, reject) => {
    const clientRequest = request(url, {
      method: 'GET',
      headers: {
        Accept: '*/*',
        Authorization: `Basic ${Buffer.from(`${config.username}:${config.password}`).toString('base64')}`
      },
      ...(url.startsWith('https:') ? { rejectUnauthorized: config.rejectUnauthorized } : {})
    }, (response) => {
      const chunks: Buffer[] = []
      response.on('data', chunk => chunks.push(Buffer.from(chunk)))
      response.on('end', () => {
        if ((response.statusCode || 500) < 200 || (response.statusCode || 500) >= 300) {
          reject(new Error(`CVAT image request failed with HTTP ${response.statusCode || 500}.`))
          return
        }
        resolve({ content: Buffer.concat(chunks), contentType: String(response.headers['content-type'] || 'image/jpeg') })
      })
    })
    clientRequest.on('error', error => reject(new Error(`Unable to connect to CVAT: ${error.message}`)))
    clientRequest.end()
  })
}

async function fetchAll<T>(config: CvatConfig, path: string) {
  const records: T[] = []
  let next: string | null = path
  let pageCount = 0

  while (next && pageCount < 100) {
    const page: CvatPage<T> = await requestCvat<CvatPage<T>>(config, next)
    records.push(...(Array.isArray(page.results) ? page.results : []))
    next = page.next
    pageCount += 1
  }

  return records
}

function safeNumber(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

const THAI_PROVINCE_NAMES: Record<string, string> = {
  ACR: 'อำนาจเจริญ', ATG: 'อ่างทอง', AYA: 'พระนครศรีอยุธยา', BKK: 'กรุงเทพมหานคร', BKN: 'บึงกาฬ', BRM: 'บุรีรัมย์', CBI: 'ชลบุรี', CCO: 'ฉะเชิงเทรา', CMI: 'เชียงใหม่', CNT: 'ชัยนาท', CPM: 'ชัยภูมิ', CPN: 'ชุมพร', CRI: 'เชียงราย', CTI: 'จันทบุรี', KBI: 'กระบี่', KKN: 'ขอนแก่น', KPT: 'กำแพงเพชร', KRI: 'กาญจนบุรี', KSN: 'กาฬสินธุ์', LEI: 'เลย', LPG: 'ลำปาง', LPN: 'ลำพูน', LRI: 'ลพบุรี', MDH: 'มุกดาหาร', MKM: 'มหาสารคาม', NAN: 'น่าน', NBI: 'นนทบุรี', NBP: 'หนองบัวลำภู', NKI: 'หนองคาย', NMA: 'นครราชสีมา', NPM: 'นครพนม', NPT: 'นครปฐม', NST: 'นครศรีธรรมราช', NSN: 'นครสวรรค์', NWT: 'นราธิวาส', NYK: 'นครนายก', PBI: 'เพชรบุรี', PCT: 'พิจิตร', PKN: 'ประจวบคีรีขันธ์', PKT: 'ภูเก็ต', PLG: 'พัทลุง', PLK: 'พิษณุโลก', PNA: 'พังงา', PNB: 'เพชรบูรณ์', PRE: 'แพร่', PRI: 'ปราจีนบุรี', PTE: 'ปทุมธานี', PTN: 'ปัตตานี', PYO: 'พะเยา', RBR: 'ราชบุรี', RET: 'ร้อยเอ็ด', RNG: 'ระนอง', RYG: 'ระยอง', SBR: 'สิงห์บุรี', SKA: 'สงขลา', SKM: 'สมุทรสงคราม', SKN: 'สมุทรสาคร', SKW: 'สระแก้ว', SNI: 'สุราษฎร์ธานี', SNK: 'สกลนคร', SPB: 'สุพรรณบุรี', SPK: 'สมุทรปราการ', SRI: 'สระบุรี', SRN: 'สุรินทร์', SSK: 'ศรีสะเกษ', STI: 'สุโขทัย', STN: 'สตูล', TAK: 'ตาก', TRG: 'ตรัง', TRT: 'ตราด', UBN: 'อุบลราชธานี', UDN: 'อุดรธานี', UTI: 'อุทัยธานี', UTT: 'อุตรดิตถ์', YLA: 'ยะลา', YST: 'ยโสธร'
}

const THAI_CHARACTER_NAMES: Record<string, string> = {
  A01: 'ก', A02: 'ข', A03: 'ฃ', A04: 'ค', A05: 'ฅ', A06: 'ฆ', A07: 'ง', A08: 'จ', A09: 'ฉ', A10: 'ช', A11: 'ซ', A12: 'ฌ', A13: 'ญ', A14: 'ฎ', A15: 'ฏ', A16: 'ฐ', A17: 'ฑ', A18: 'ฒ', A19: 'ณ', A20: 'ด', A21: 'ต', A22: 'ถ', A23: 'ท', A24: 'ธ', A25: 'น', A26: 'บ', A27: 'ป', A28: 'ผ', A29: 'ฝ', A30: 'พ', A31: 'ฟ', A32: 'ภ', A33: 'ม', A34: 'ย', A35: 'ร', A36: 'ล', A37: 'ว', A38: 'ศ', A39: 'ษ', A40: 'ส', A41: 'ห', A42: 'ฬ', A43: 'อ', A44: 'ฮ'
}

const LAO_PROVINCE_NAMES: Record<string, string> = {
  PSL: 'ຜົ້ງສາລີ', LNT: 'ຫຼວງນ້ຳທາ', ODX: 'ອຸດົມໄຊ', BOK: 'ບໍ່ແກ້ວ', LPB: 'ຫຼວງພະບາງ', HPN: 'ຫົວພັນ', XKH: 'ຊຽງຂວາງ', XYL: 'ໄຊຍະບູລີ', XSB: 'ໄຊສົມບູນ', VTE: 'ກຳແພງນະຄອນ', VTE2: 'ນະຄອນຫຼວງວຽງຈັນ', VTP: 'ວຽງຈັນ', BLK: 'ບໍລິຄຳໄຊ', KHM: 'ຄຳມ່ວນ', SVK: 'ສະຫວັນນະເຂດ', SLV: 'ສາລະວັນ', XEK: 'ເຊກອງ', CPS: 'ຈຳປາສັກ', ATP: 'ອັດຕະປື'
}

const LAO_CHARACTER_NAMES: Record<string, string> = {
  A: 'ກ', B: 'ຂ', C: 'ຄ', D: 'ງ', J: 'ຕ', E: 'ຈ', F: 'ສ', H: 'ຍ', I: 'ດ', K: 'ຖ', L: 'ທ', M: 'ນ', N: 'ບ', O: 'ປ', P: 'ຜ', Q: 'ຝ', S: 'ຟ', R: 'ພ', T: 'ມ', U: 'ຢ', V: 'ຣ', W: 'ລ', X: 'ວ', Y: 'ຫ', Z: 'ອ', AA: 'ຮ'
}

const CVAT_LABEL_GROUPS = [THAI_PROVINCE_NAMES, THAI_CHARACTER_NAMES, LAO_PROVINCE_NAMES, LAO_CHARACTER_NAMES]

function cvatLabelCode(label: string) {
  const normalized = label.trim()
  for (const group of CVAT_LABEL_GROUPS) {
    const match = Object.entries(group).find(([code, name]) => code === normalized || name === normalized)
    if (match) return match[0]
  }
  return normalized
}

function cvatLabelName(label: string) {
  const code = cvatLabelCode(label)
  for (const group of CVAT_LABEL_GROUPS) {
    if (group[code]) return group[code]
  }
  return label.trim()
}

function normalizeCvatLabels(value: unknown): Array<{ id: number, name: string }> {
  if (Array.isArray(value)) {
    return value.map(item => asObject(item)).filter(item => item.id !== undefined).map(item => ({ id: Number(item.id), name: String(item.name || '') }))
  }
  const object = asObject(value)
  if (object.id !== undefined && object.name !== undefined) return [{ id: Number(object.id), name: String(object.name) }]
  for (const key of ['results', 'items', 'labels', 'data']) {
    if (object[key] !== undefined) {
      const nested = normalizeCvatLabels(object[key])
      if (nested.length) return nested
    }
  }
  const values = Object.values(object)
  const objectValues = values.filter(item => item && typeof item === 'object' && !Array.isArray(item))
  if (objectValues.length) return normalizeCvatLabels(objectValues)
  return Object.entries(object)
    .filter(([key, item]) => /^\d+$/.test(key) && typeof item === 'string')
    .map(([key, item]) => ({ id: Number(key), name: String(item) }))
}

function emptyJobStateCounts(): CvatJobStateCounts {
  return { new: 0, inProgress: 0, completed: 0, rejected: 0, other: 0 }
}

function jobStateCounts(jobs: CvatJob[]): CvatJobStateCounts {
  return jobs.reduce((counts, job) => {
    const state = String(job.state || '').toLowerCase().replace(/_/g, ' ')
    if (state === 'new') counts.new += 1
    else if (state === 'in progress') counts.inProgress += 1
    else if (state === 'completed') counts.completed += 1
    else if (state === 'rejected') counts.rejected += 1
    else counts.other += 1
    return counts
  }, emptyJobStateCounts())
}

function mergeJobStateCounts(target: CvatJobStateCounts, source: CvatJobStateCounts) {
  target.new += source.new
  target.inProgress += source.inProgress
  target.completed += source.completed
  target.rejected += source.rejected
  target.other += source.other
  return target
}

function taskSummary(task: CvatTask, jobs: CvatJob[]): CvatTaskSummary {
  const jobStates = jobStateCounts(jobs)
  return {
    id: task.id,
    name: task.name,
    projectId: task.project_id,
    projectName: task.project_name,
    status: task.status,
    subset: task.subset || '',
    size: safeNumber(task.size),
    mediaType: task.media_type || 'image',
    jobs: jobs.length,
    jobIds: jobs.map(job => job.id),
    jobNames: jobs.map(job => String(job.name || `Job #${job.id}`)),
    completedJobs: jobStates.completed,
    jobStates,
    assignee: task.assignee?.username || null,
    updatedAt: task.updated_date
  }
}

export async function getCvatOverview(): Promise<CvatOverview> {
  const config = getCvatConfig()
  const projects = await fetchAll<CvatProject>(config, '/api/projects?page=1')
  const tasksByProject = await Promise.all(
    projects.map(async (project) => ({
      project,
      tasks: await fetchAll<CvatTask>(config, `/api/tasks?project_id=${encodeURIComponent(project.id)}&page=1`)
    }))
  )

  const projectSummaries = tasksByProject.map(({ project, tasks }) => {
    const tasksWithJobs = tasks.map(async (task) => ({
      task,
      jobs: await fetchAll<CvatJob>(config, `/api/jobs?task_id=${encodeURIComponent(task.id)}&page=1`)
    }))
    return Promise.all(tasksWithJobs).then((resolvedTasks) => {
      const summaries = resolvedTasks.map(({ task, jobs }) => taskSummary(task, jobs))
      const jobStates = summaries.reduce((counts, task) => mergeJobStateCounts(counts, task.jobStates), emptyJobStateCounts())
      return {
        id: project.id,
        name: project.name,
        status: project.status,
        dimension: project.dimension,
        taskCount: summaries.length,
        imageCount: summaries.reduce((total, task) => total + task.size, 0),
        jobs: summaries.reduce((total, task) => total + task.jobs, 0),
        completedJobs: summaries.reduce((total, task) => total + task.completedJobs, 0),
        jobStates,
        updatedAt: project.updated_date,
        tasks: summaries
      }
    })
  })
  const resolvedProjects = await Promise.all(projectSummaries)

  return {
    baseUrl: config.baseUrl,
    fetchedAt: new Date().toISOString(),
    totals: {
      projects: resolvedProjects.length,
      tasks: resolvedProjects.reduce((total, project) => total + project.taskCount, 0),
      images: resolvedProjects.reduce((total, project) => total + project.imageCount, 0),
      jobs: resolvedProjects.reduce((total, project) => total + project.jobs, 0),
      completedJobs: resolvedProjects.reduce((total, project) => total + project.completedJobs, 0)
    },
    projects: resolvedProjects
  }
}

interface CvatTaskDetail {
  labels?: unknown
}

interface CvatTaskMeta {
  frames?: Array<{ name?: string, width?: number, height?: number }>
}

interface CvatAnnotations {
  shapes?: Array<{ frame?: number, label_id?: number, type?: string, points?: number[] }>
}

function jobStateLabel(job: CvatJob) {
  const state = String(job.state || job.status || 'Other').trim().toLowerCase().replace(/_/g, ' ')
  if (state === 'in progress') return 'In progress'
  if (state === 'completed') return 'Completed'
  if (state === 'new') return 'New'
  if (state === 'rejected') return 'Rejected'
  return state ? state.replace(/\b\w/g, character => character.toUpperCase()) : 'Other'
}

function jobRange(job: CvatJob) {
  const start = Number(job.start_frame)
  const stop = Number(job.stop_frame)
  const count = Number(job.frame_count)
  if (!Number.isFinite(start)) return null
  if (Number.isFinite(stop)) return { start, stop, count: Math.max(0, stop - start + 1) }
  if (Number.isFinite(count) && count > 0) return { start, stop: start + count - 1, count }
  return null
}

let imageReportCache: { expiresAt: number, items: CvatImageRecord[], projects: Array<{ id: number, name: string }>, tasks: Array<{ id: number, name: string, projectId: number }>, labels: string[] } | null = null

async function loadCvatImageRecords(config: CvatConfig) {
  const overview = await getCvatOverview()
  const taskEntries = overview.projects.flatMap(project => project.tasks.map(task => ({ project, task })))
  const loaded = await Promise.all(taskEntries.map(async ({ project, task }) => {
    const [detail, meta, annotations, jobs] = await Promise.all([
      requestCvat<CvatTaskDetail>(config, `/api/tasks/${task.id}`),
      requestCvat<CvatTaskMeta>(config, `/api/tasks/${task.id}/data/meta`),
      requestCvat<CvatAnnotations>(config, `/api/tasks/${task.id}/annotations`),
      fetchAll<CvatJob>(config, `/api/jobs?task_id=${encodeURIComponent(task.id)}&page=1`)
    ])
    const detailObject = asObject(detail)
    const labelsReference = detailObject.labels
    const labelsUrl = typeof labelsReference === 'string' ? labelsReference : String(asObject(labelsReference).url || '')
    const labelResponse = labelsUrl ? await fetchAll<{ id: number, name: string }>(config, labelsUrl) : []
    const rawLabels = labelResponse.length ? labelResponse : detailObject.labels
    const labelList = normalizeCvatLabels(rawLabels)
    const labels = new Map(labelList.map((label) => {
      const value = asObject(label)
      return [Number(value.id), String(value.name || '')] as const
    }))
    const shapesByFrame = new Map<number, CvatImageBox[]>()
    for (const shape of annotations.shapes || []) {
      const frame = Number(shape.frame)
      const points = Array.isArray(shape.points) ? shape.points.map(Number) : []
      if (!Number.isFinite(frame) || points.length < 4) continue
      const rawLabel = labels.get(Number(shape.label_id)) || `label_${shape.label_id ?? 'unknown'}`
      const box = {
        label: rawLabel,
        labelCode: cvatLabelCode(rawLabel),
        labelName: cvatLabelName(rawLabel),
        labelId: Number(shape.label_id) || 0,
        type: String(shape.type || 'rectangle'),
        points
      }
      shapesByFrame.set(frame, [...(shapesByFrame.get(frame) || []), box])
    }
    return (meta.frames || []).map((frame, frameIndex) => {
      const boxes = shapesByFrame.get(frameIndex) || []
      const matchingJob = jobs
        .map(job => ({ job, range: jobRange(job) }))
        .sort((left, right) => (left.range?.start ?? Number.MAX_SAFE_INTEGER) - (right.range?.start ?? Number.MAX_SAFE_INTEGER))
        .find(({ range }) => range && frameIndex >= range.start && frameIndex <= range.stop)
      const fallbackJob = jobs.length === 1 ? jobs[0] : null
      const job = matchingJob?.job || fallbackJob
      const range = matchingJob?.range || (fallbackJob ? jobRange(fallbackJob) : null)
      const jobNames = job ? [String(job.name || `Job #${job.id}`)] : task.jobNames
      const jobStatuses = job ? [jobStateLabel(job)] : [
        [task.jobStates.new, 'New'],
        [task.jobStates.inProgress, 'In progress'],
        [task.jobStates.completed, 'Completed'],
        [task.jobStates.rejected, 'Rejected'],
        [task.jobStates.other, 'Other']
      ].filter(([count]) => Number(count) > 0).map(([, status]) => String(status))
      const annotationCode = boxes
        .slice()
        .sort((left, right) => (left.points[0] || 0) - (right.points[0] || 0))
        .map(box => box.labelCode)
        .join('')
      return {
        code: `CVAT-T${task.id}-F${frameIndex}`,
        annotationCode,
        taskId: task.id,
        taskName: task.name,
        projectId: project.id,
        projectName: project.name,
        frame: frameIndex,
        filename: frame.name || `task-${task.id}-frame-${frameIndex}`,
        width: Number(frame.width) || 0,
        height: Number(frame.height) || 0,
        taskStatus: task.status,
        jobStatus: job ? jobStateLabel(job) : task.completedJobs >= task.jobs && task.jobs > 0 ? 'Completed' : task.jobs > 0 ? 'In progress' : 'New',
        jobStatuses,
        jobNames,
        jobId: job?.id ?? null,
        jobName: job ? String(job.name || `Job #${job.id}`) : null,
        jobFrame: job ? frameIndex : null,
        jobPosition: job && range ? frameIndex - range.start + 1 : null,
        jobFrameCount: range?.count ?? null,
        boxes
      }
    })
  }))

  const items = loaded.flat()
  return {
    items,
    projects: overview.projects.map(project => ({ id: project.id, name: project.name })),
    tasks: taskEntries.map(({ project, task }) => ({ id: task.id, name: task.name, projectId: project.id })),
    labels: [...new Set(items.flatMap(item => item.boxes.map(box => box.labelCode)))].sort()
  }
}

export async function getCvatImageReport(filters: CvatImageFilters = {}, page = 1, pageSize = 24): Promise<CvatImageReport> {
  const config = getCvatConfig()
  const hasFallbackLabels = imageReportCache?.labels.some(label => /^label_\d+$/.test(label))
  const hasLegacyBoxes = imageReportCache?.items.some(item => item.boxes.some(box => !box.labelCode || !box.labelName))
  const hasLegacyJobStatuses = imageReportCache?.items.some(item => !item.jobStatuses)
  const hasLegacyJobNames = imageReportCache?.items.some(item => !item.jobNames)
  const hasLegacyJobLocation = imageReportCache?.items.some(item => item.jobId === undefined)
  if (!imageReportCache || imageReportCache.expiresAt < Date.now() || hasFallbackLabels || hasLegacyBoxes || hasLegacyJobStatuses || hasLegacyJobNames || hasLegacyJobLocation) {
    const loaded = await loadCvatImageRecords(config)
    imageReportCache = { expiresAt: Date.now() + 30_000, ...loaded }
  }
  const query = String(filters.search || '').trim().toLowerCase()
  const filtered = imageReportCache.items.filter((item) => {
    const hasBox = item.boxes.length > 0
    const text = `${item.code} ${item.annotationCode} ${item.filename} ${item.taskName} ${item.projectName} ${item.jobNames.join(' ')} ${item.boxes.map(box => `${box.labelCode} ${box.labelName} ${box.label}`).join(' ')}`.toLowerCase()
    const jobSearch = String(filters.jobSearch || '').trim().toLowerCase()
    return (!query || text.includes(query))
      && (!filters.projectId || filters.projectId === 'all' || item.projectId === Number(filters.projectId))
      && (!filters.taskId || filters.taskId === 'all' || item.taskId === Number(filters.taskId))
      && (!filters.label || filters.label === 'all' || item.boxes.some(box => box.label === filters.label || box.labelCode === filters.label || box.labelName === filters.label))
      && (!filters.status || filters.status === 'all' || item.taskStatus === filters.status)
      && (!filters.jobStatus || filters.jobStatus === 'all' || item.jobStatuses.some(status => status.toLowerCase().replace(/[\s_]/g, '') === filters.jobStatus!.toLowerCase().replace(/[\s_]/g, '')))
      && (!jobSearch || item.jobNames.some(name => name.toLowerCase().includes(jobSearch)))
      && (!filters.box || filters.box === 'all' || (filters.box === 'with-box' ? hasBox : !hasBox))
  })
  const safePageSize = Math.min(Math.max(pageSize, 1), 100)
  const totalPages = Math.max(1, Math.ceil(filtered.length / safePageSize))
  const safePage = Math.min(Math.max(page, 1), totalPages)
  return {
    items: filtered.slice((safePage - 1) * safePageSize, safePage * safePageSize),
    total: filtered.length,
    page: safePage,
    pageSize: safePageSize,
    totalPages,
    filters: {
      projects: imageReportCache.projects,
      tasks: imageReportCache.tasks,
      labels: imageReportCache.labels
    }
  }
}

export async function getCvatImage(taskId: number, frame: number) {
  const config = getCvatConfig()
  if (!Number.isInteger(taskId) || taskId < 1 || !Number.isInteger(frame) || frame < 0) return null
  return requestCvatBinary(config, `/api/tasks/${taskId}/data?type=frame&number=${frame}`)
}

