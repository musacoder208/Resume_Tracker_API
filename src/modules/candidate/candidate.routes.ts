import path from 'path'
import { Router } from 'express'
import multer from 'multer'
import { authMiddleware } from '@shared/middleware/auth.middleware'
import { validate, validateQuery } from '@shared/validators/validate'
import { saveCandidatesSchema, updateCandidateScoreSchema, saveCandidateFeedbackSchema, saveHRFeedbackSchema, getCandidateListSchema } from './schemas/candidate.schema'
import { candidateController } from './candidate.controller'

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, 'uploads/'),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname)
    const base = path.basename(file.originalname, ext).replace(/\s+/g, '_')
    cb(null, `${base}_${Date.now()}${ext}`)
  },
})

const upload = multer({ storage })

const router = Router()
router.use(authMiddleware)

router.post('/uploadResumes', upload.array('files'), candidateController.uploadResumes)
router.post('/uploadResumesStream', upload.array('files'), candidateController.uploadResumesStream)
router.get('/getUploadStatus', candidateController.getUploadStatus)
router.post('/selectCandidateFiles', upload.array('files'), candidateController.selectCandidateFiles)
router.post('/saveCandidates', validate(saveCandidatesSchema), candidateController.saveCandidates)
router.get('/getCandidateList', validateQuery(getCandidateListSchema), candidateController.getCandidateList)
router.get('/getCandidateDetails/:id', candidateController.getCandidateDetailsById)
router.get('/getFeedbackTypes', candidateController.getFeedbackTypes)
router.post('/saveHRFeedback', validate(saveHRFeedbackSchema), candidateController.saveHRFeedback)
router.post('/saveCandidateFeedback', validate(saveCandidateFeedbackSchema), candidateController.saveCandidateFeedback)
router.post('/updateCandidateScore', validate(updateCandidateScoreSchema), candidateController.updateCandidateScore)

export default router
