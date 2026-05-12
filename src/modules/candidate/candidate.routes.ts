import path from 'path'
import { Router } from 'express'
import multer from 'multer'
import { authMiddleware } from '@shared/middleware/auth.middleware'
import { validate } from '@shared/validators/validate'
import { saveCandidatesSchema, updateCandidateScoreSchema, saveCandidateFeedbackSchema } from './schemas/candidate.schema'
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

router.post('/uploadResumes', authMiddleware, upload.array('files'), candidateController.uploadResumes)
router.post('/selectCandidateFiles', authMiddleware, upload.array('files'), candidateController.selectCandidateFiles)
router.post('/saveCandidates', authMiddleware, validate(saveCandidatesSchema), candidateController.saveCandidates)
router.get('/getCandidateDetails/:id', authMiddleware, candidateController.getCandidateDetailsById)
router.get('/getFeedbackTypes', authMiddleware, candidateController.getFeedbackTypes)
router.post('/saveCandidateFeedback', authMiddleware, validate(saveCandidateFeedbackSchema), candidateController.saveCandidateFeedback)
router.get('/getJDDropdown', authMiddleware, candidateController.getJDDropdown)
router.post('/updateCandidateScore', authMiddleware, validate(updateCandidateScoreSchema), candidateController.updateCandidateScore)

export default router
