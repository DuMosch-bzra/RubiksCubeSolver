import * as algs from './algorithms.ts'
import {
  buildCaseTable, cornerPermutationKey, edgeOrientationKey, orientationKey, permutationKey,
} from './caseTable.ts'

export const OLL_EDGES_2LOOK = buildCaseTable({
  name: '2-look OLL: edges', algorithms: algs.OLL_2LOOK_EDGES, key: edgeOrientationKey, preAuf: true,
})

export const OLL_CORNERS_2LOOK = buildCaseTable({
  name: '2-look OLL: corners', algorithms: algs.OLL_2LOOK_CORNERS, key: orientationKey, preAuf: true,
})

export const PLL_CORNERS_2LOOK = buildCaseTable({
  name: '2-look PLL: corners', algorithms: algs.PLL_2LOOK_CORNERS, key: cornerPermutationKey, preAuf: true, postAuf: true,
})

export const PLL_EDGES_2LOOK = buildCaseTable({
  name: '2-look PLL: edges', algorithms: algs.PLL_2LOOK_EDGES, key: permutationKey, preAuf: true, postAuf: true,
})

export const PLL_FULL = buildCaseTable({
  name: 'PLL', algorithms: algs.PLL_FULL, key: permutationKey, preAuf: true, postAuf: true,
})
