import './App.css'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'

const App = () => {

  return (
    <Canvas>
      <OrbitControls />

      <ambientLight intensity={0.4} />
      <pointLight position={[10, 10, 10]} />
      <mesh>
        <boxGeometry args={[1,1,1]} />
        <meshStandardMaterial color="orange" />
      </mesh>
    </Canvas>
  )
}

export default App
