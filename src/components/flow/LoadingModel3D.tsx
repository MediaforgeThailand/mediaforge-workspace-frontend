import { Suspense, useRef, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { useGLTF, useAnimations, ContactShadows, SpotLight } from "@react-three/drei";
import type { Group } from "three";

function Model() {
  const ref = useRef<Group>(null);
  const { scene, animations } = useGLTF("/models/dancing_cat.glb");
  const { actions } = useAnimations(animations, ref);

  useEffect(() => {
    const firstAction = Object.values(actions)[0];
    if (firstAction) {
      firstAction.reset().fadeIn(0.3).play();
    }
  }, [actions]);

  return (
    <group ref={ref} scale={0.55} position={[0, -0.8, 0]} rotation={[-0.15, Math.PI + 0.52 - 1.05, 0]}>
      <primitive object={scene} />
    </group>
  );
}

export default function LoadingModel3D() {
  return (
    <div className="w-full h-[180px] rounded-lg overflow-hidden">
      <Canvas
        camera={{ position: [3, 2, 3], fov: 40 }}
        gl={{ antialias: true, alpha: true }}
        shadows
        style={{ background: "transparent" }}
      >
        {/* Dim ambient so spotlight is visible */}
        <ambientLight intensity={0.15} />

        {/* Volumetric spotlight from above */}
        <SpotLight
          position={[0, 6, 1]}
          angle={0.35}
          penumbra={0.8}
          intensity={4}
          color="#c4d0ff"
          distance={12}
          attenuation={5}
          anglePower={6}
          castShadow
        />

        {/* Subtle rim light */}
        <pointLight position={[-2, 1, -2]} intensity={0.2} color="#F4FF00" />
        <pointLight position={[2, 1, -1]} intensity={0.15} color="#b4c5ff" />

        {/* Ground shadow */}
        <ContactShadows
          position={[0, -0.8, 0]}
          opacity={0.6}
          scale={4}
          blur={2.5}
          far={3}
          color="#1a1a3e"
        />

        <Suspense fallback={null}>
          <Model />
        </Suspense>
      </Canvas>
    </div>
  );
}

useGLTF.preload("/models/dancing_cat.glb");
