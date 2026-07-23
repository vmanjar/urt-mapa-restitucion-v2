import * as THREE from 'three';
import gsap from 'gsap';

// ==========================================
// 1. GEOGRAPHIC CONSTANTS & URT DATA
// ==========================================
const minLng = -83.5, maxLng = -64.5;
const minLat = -5.0, maxLat = 14.0;
const scaleFactor = 12.0; 
const centerLng = -74.0, centerLat = 4.5;
const sphereRadius = 9.5; 

const departments = [
    { name: "DT Antioquia", sedes: "SEDE: Medellín" },
    { name: "DT Apartadó", sedes: "SEDE: Apartadó" },
    { name: "DT Bogotá", sedes: "SEDE: Bogotá" },
    { name: "DT Bolívar", sedes: "SEDES: El Carmen de Bolívar, Sincelejo" },
    { name: "DT Caquetá", sedes: "SEDE: Florencia" },
    { name: "DT Cauca", sedes: "SEDES: Popayán, Neiva" },
    { name: "DT Cesar", sedes: "SEDE: Valledupar" },
    { name: "DT Chocó", sedes: "SEDE: Quibdó" },
    { name: "DT Córdoba", sedes: "SEDES: Montería, Caucasia" },
    { name: "DT Magdalena", sedes: "SEDE: Santa Marta" },
    { name: "DT Magdalena Medio", sedes: "SEDES: Barrancabermeja, Bucaramanga" },
    { name: "DT Meta", sedes: "SEDE: Villavicencio" },
    { name: "DT Nariño", sedes: "SEDES: Pasto, Tumaco" },
    { name: "DT Norte de Santander", sedes: "SEDE: Cúcuta" },
    { name: "DT Putumayo", sedes: "SEDE: Mocoa" },
    { name: "DT Tolima", sedes: "SEDE: Ibagué" },
    { name: "DT Valle del Cauca", sedes: "SEDES: Pereira, Cali" }
];

function lngLatToPixel(lng, lat) {
    const u = Math.floor(((lng - minLng) / (maxLng - minLng)) * 512);
    const v = Math.floor((1.0 - (lat - minLat) / (maxLat - minLat)) * 512);
    return { u: Math.max(0, Math.min(511, u)), v: Math.max(0, Math.min(511, v)) };
}

// ==========================================
// 2. 4-ASSET LOADER
// ==========================================
let elevData = null, terrData = null, dtsData = null, forestData = null;

function loadAssetsAndStart() {
    let loaded = 0, booted = false;
    const checkReady = () => { if (++loaded === 4 && !booted) { booted = true; initApp(elevData, terrData, dtsData, forestData, false); } };
    const fail = (e) => { 
        if (!booted) { 
            booted = true; 
            console.warn("Image asset failed. Running procedural fallback.", e); 
            initApp(null, null, null, null, true); 
        } 
    };
    setTimeout(() => { if (!booted) fail("Timeout"); }, 2500);

    function loadImage(src, callback) {
        const img = new Image();
        img.onload = () => {
            const cvs = document.createElement('canvas'); cvs.width = 512; cvs.height = 512;
            const ctx = cvs.getContext('2d'); ctx.drawImage(img, 0, 0);
            callback(ctx.getImageData(0, 0, 512, 512).data);
            checkReady();
        };
        img.onerror = fail;
        img.src = src;
    }

    loadImage("elevation.png", data => elevData = data);
    loadImage("territories.png", data => terrData = data);
    loadImage("dts.png", data => dtsData = data);
    loadImage("forest.png", data => forestData = data);
}

// ==========================================
// 3. MAIN APPLICATION
// ==========================================
function initApp(elevPixelData, terrPixelData, dtsPixelData, forestPixelData, isFallback) {
    const canvas = document.querySelector('#webgl-canvas');
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf4ebd8);
    scene.fog = new THREE.FogExp2(0xf4ebd8, 0.035); 

    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.rotation.order = "YXZ"; 

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.65);
    dirLight.position.set(6, 15, 8);
    scene.add(dirLight);

    // --- Build Point Cloud ---
    let instancedMesh;
    function buildTerrain() {
        const posList = [], types = [], dtList = [], forestList = [];
        const isMobile = window.innerWidth < 768;
        const targetPoints = isMobile ? 18000 : 40000;
        let current = 0;

        while (current < targetPoints) {
            const testLng = minLng + Math.random() * (maxLng - minLng);
            const testLat = minLat + Math.random() * (maxLat - minLat);
            const dist = Math.hypot(testLng - centerLng, testLat - centerLat);
            if (dist > sphereRadius) continue;
            
            if (dist / sphereRadius > 0.90 && Math.random() > Math.pow((1.0 - dist / sphereRadius) / 0.10, 1.5)) continue;

            let y = 0.0, typeVal = 0.0, dtVal = -1.0, forestVal = 0.0;

            if (!isFallback && terrPixelData) {
                const pixel = lngLatToPixel(testLng, testLat);
                const idx = (pixel.v * 512 + pixel.u) * 4;
                const r = terrPixelData[idx], g = terrPixelData[idx + 1], b = terrPixelData[idx + 2], elevRaw = elevPixelData[idx];
                
                if (forestPixelData) forestVal = forestPixelData[idx] / 255.0;

                if (dtsPixelData && dtsPixelData[idx] > 0) {
                    dtVal = Math.round(dtsPixelData[idx] / 15.0) - 1.0;
                }

                if (r > 150 && g < 100 && b < 100) { 
                    const altitudeBias = 0.25 + 0.75 * (elevRaw / 255.0);
                    if (Math.random() > altitudeBias) continue;
                    y = (elevRaw / 255.0) * 1.5 * 0.80; typeVal = 2.0; 
                }
                else if (b > 150 && r < 100 && g < 100) { 
                    if (Math.random() > 0.20) continue;
                    y = (elevRaw / 255.0) * 1.5 * 0.80; typeVal = 1.0; 
                }
                else { 
                    if (Math.random() > 0.075) continue; 
                    y = -0.01; typeVal = 0.0; 
                } 
            } else {
                if (Math.random() > 0.3) continue;
                y = Math.random() * 0.5; typeVal = 2.0;
            }
            
            const x = ((testLng - minLng) / (maxLng - minLng) - 0.5) * scaleFactor;
            const z = -(((testLat - minLat) / (maxLat - minLat) - 0.5)) * scaleFactor;
            
            posList.push(new THREE.Vector3(x, y, z));
            types.push(typeVal);
            dtList.push(dtVal);
            forestList.push(forestVal);
            current++;
        }

        const geo = new THREE.IcosahedronGeometry(0.016, 0);
        const typesArr = new Float32Array(posList.length);
        const elevArr = new Float32Array(posList.length);
        const dtArr = new Float32Array(posList.length);
        const forestArr = new Float32Array(posList.length);

        for(let i = 0; i < posList.length; i++) { 
            typesArr[i] = types[i]; 
            elevArr[i] = posList[i].y; 
            dtArr[i] = dtList[i];
            forestArr[i] = forestList[i];
        }
        
        geo.setAttribute('aType', new THREE.InstancedBufferAttribute(typesArr, 1));
        geo.setAttribute('aElevation', new THREE.InstancedBufferAttribute(elevArr, 1));
        geo.setAttribute('aDT', new THREE.InstancedBufferAttribute(dtArr, 1));
        geo.setAttribute('aForest', new THREE.InstancedBufferAttribute(forestArr, 1));

        const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
        
        mat.onBeforeCompile = (shader) => {
            shader.uniforms.uTime = { value: 0 };
            shader.uniforms.uSize = { value: (isMobile ? 6.0 : 4.0) * Math.min(window.devicePixelRatio, 2) };
            shader.uniforms.uHoveredDT = { value: -1.0 }; 
            shader.uniforms.uHoverBlend = { value: 0.0 }; 
            
            mat.userData.shader = shader;
            
            shader.vertexShader = `
                attribute float aType;
                attribute float aElevation;
                attribute float aDT;
                attribute float aForest;
                
                varying float vElevation;
                varying float vType;
                varying float vDT;
                
                uniform float uTime;
                uniform float uSize;
            ` + shader.vertexShader;

            shader.vertexShader = shader.vertexShader.replace(
                '#include <begin_vertex>',
                `
                #include <begin_vertex>
                vType = aType;
                vElevation = aElevation;
                vDT = aDT;
                
                float sizeMult = 0.7 + (aForest * 1.1);
                transformed *= (uSize / 4.0) * sizeMult;
                
                vec4 iPos = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
                float sway = (aType < 1.5) ? 0.04 : 0.14;
                float wave = sin(uTime * 1.4 + iPos.x * 1.1 + iPos.z * 1.1) * cos(uTime * 1.0 + iPos.x * 0.7) * 0.06;
                
                if (aType > 0.5) { 
                    transformed.x += aElevation * wave * sway; 
                    transformed.z += aElevation * wave * sway * 0.4; 
                } else { 
                    float oW = sin(iPos.x * 2.2 + uTime * 1.6) * cos(iPos.z * 2.2 + uTime * 1.2) * 0.035; 
                    transformed.y += oW; 
                    vElevation += oW; 
                }
                `
            );

            shader.fragmentShader = `
                varying float vElevation;
                varying float vType;
                varying float vDT;
                uniform float uHoveredDT;
                uniform float uHoverBlend;
            ` + shader.fragmentShader;

            shader.fragmentShader = shader.fragmentShader.replace(
                'vec4 diffuseColor = vec4( diffuse, opacity );',
                `
                vec3 customColor = vec3(0.0);
                
                if (vType < 0.5) {
                    customColor = vec3(0.890, 0.855, 0.780); 
                }
                else if (vType < 1.5) {
                    customColor = vec3(0.953, 0.914, 0.830); 
                } 
                else {
                    float nH = clamp(vElevation / 0.70, 0.0, 1.0);
                    vec3 c0 = vec3(0.533, 0.608, 0.502); // Earth Green
                    vec3 c1 = vec3(0.702, 0.651, 0.525); 
                    vec3 c2 = vec3(0.553, 0.482, 0.380); 
                    vec3 c3 = vec3(0.361, 0.302, 0.239); 
                    vec3 c4 = vec3(0.200, 0.169, 0.149); // Charcoal
                    
                    if (nH < 0.25) customColor = mix(c0, c1, nH / 0.25);
                    else if (nH < 0.50) customColor = mix(c1, c2, (nH - 0.25)/0.25);
                    else if (nH < 0.75) customColor = mix(c2, c3, (nH - 0.50)/0.25);
                    else customColor = mix(c3, c4, (nH - 0.75)/0.25);

                    // HOVER HIGHLIGHT: Dark Brick / Red Dirt (#A83D1E)
                    if (uHoveredDT >= 0.0 && abs(vDT - uHoveredDT) < 0.1) {
                        vec3 darkBrick = vec3(0.659, 0.239, 0.118);
                        customColor = mix(customColor, darkBrick, 0.88 * uHoverBlend);
                    }
                }
                
                vec4 diffuseColor = vec4(customColor, opacity);
                `
            );
        };
        
        instancedMesh = new THREE.InstancedMesh(geo, mat, posList.length);
        const dummy = new THREE.Object3D();
        for (let i = 0; i < posList.length; i++) {
            dummy.position.copy(posList[i]); dummy.updateMatrix();
            instancedMesh.setMatrixAt(i, dummy.matrix);
        }
        scene.add(instancedMesh);
    }
    
    buildTerrain();

    // --- Displaced 3D Terrain Collider Mesh ---
    const rayTerrainGeo = new THREE.PlaneGeometry(scaleFactor, scaleFactor, 64, 64);
    rayTerrainGeo.rotateX(-Math.PI / 2);
    if (!isFallback && elevPixelData) {
        const posAttr = rayTerrainGeo.attributes.position;
        for (let i = 0; i < posAttr.count; i++) {
            const x = posAttr.getX(i);
            const z = posAttr.getZ(i);
            const lng = minLng + ((x / scaleFactor) + 0.5) * (maxLng - minLng);
            const lat = minLat + ((-z / scaleFactor) + 0.5) * (maxLat - minLat);
            const pixel = lngLatToPixel(lng, lat);
            const idx = (pixel.v * 512 + pixel.u) * 4;
            const elevRaw = elevPixelData[idx];
            const y = (elevRaw / 255.0) * 1.5 * 0.80;
            posAttr.setY(i, y);
        }
        rayTerrainGeo.computeVertexNormals();
    }
    const rayTerrainMesh = new THREE.Mesh(rayTerrainGeo, new THREE.MeshBasicMaterial({ visible: false }));
    scene.add(rayTerrainMesh);

    // Ambient Birds
    const mapWidth = scaleFactor;
    const birdsCount = 40;
    const birdsGeo = new THREE.BufferGeometry();
    const birdsPos = new Float32Array(birdsCount * 3);
    const birdsBaseY = new Float32Array(birdsCount); 
    for(let i = 0; i < birdsCount; i++) {
        birdsPos[i*3] = (Math.random() - 0.5) * mapWidth;       
        const height = 1.0 + Math.random() * 1.5; 
        birdsPos[i*3+1] = height;                              
        birdsBaseY[i] = height;                                
        birdsPos[i*3+2] = (Math.random() - 0.5) * mapWidth;     
    }
    birdsGeo.setAttribute('position', new THREE.BufferAttribute(birdsPos, 3));
    const birdsMat = new THREE.PointsMaterial({ color: 0x4a433a, size: 0.05, transparent: true, depthWrite: false });
    birdsMat.onBeforeCompile = (shader) => {
        shader.uniforms.mapWidth = { value: mapWidth };
        shader.vertexShader = `varying vec3 vPos;` + shader.vertexShader.replace(`#include <begin_vertex>`, `#include <begin_vertex>\n vPos = position;`);
        shader.fragmentShader = `uniform float mapWidth; varying vec3 vPos;` + shader.fragmentShader.replace(
            `vec4 diffuseColor = vec4( diffuse, opacity );`,
            `float dist = length(vPos.xz); float edgeFade = smoothstep(mapWidth * 0.5, mapWidth * 0.4, dist); vec4 diffuseColor = vec4( diffuse, opacity * edgeFade );`
        );
    };
    const flockOfBirds = new THREE.Points(birdsGeo, birdsMat);
    scene.add(flockOfBirds);

    // --- Custom Drone Camera Controller ---
    const camState = { targetX: 0, targetZ: 2, targetYaw: 0, zoom: 0.3 };
    let isDragging = false, lastMousePos = { x: 0, y: 0 }, touchStartDist = 0;

    const innerLimit = mapWidth * 0.25, outerLimit = mapWidth * 0.45; 
    function applyFriction(currentPos, move) {
        if (currentPos > innerLimit && move > 0) return move * Math.max(0, 1.0 - ((currentPos - innerLimit) / (outerLimit - innerLimit)));
        if (currentPos < -innerLimit && move < 0) return move * Math.max(0, 1.0 - ((Math.abs(currentPos) - innerLimit) / (outerLimit - innerLimit)));
        return move;
    }

    function handleDown(x, y) { isDragging = true; lastMousePos = { x, y }; }
    function handleMove(x, y) {
        if (!isDragging) return;
        const deltaX = x - lastMousePos.x, deltaY = y - lastMousePos.y;
        
        const cenitalProgress = Math.max(0, Math.min(1, (camState.zoom - 0.8) / 0.2));
        camState.targetYaw += deltaX * (0.0012 * (1.0 - cenitalProgress));

        const baseSpeed = 0.0026, zoomComp = 1.0 + (camState.zoom * 1.5); 
        const moveDistY = deltaY * baseSpeed * zoomComp;
        const moveDistX = -deltaX * baseSpeed * zoomComp * cenitalProgress;

        let moveX = (-Math.sin(camState.targetYaw) * moveDistY) + (Math.cos(camState.targetYaw) * moveDistX);
        let moveZ = (-Math.cos(camState.targetYaw) * moveDistY) + (-Math.sin(camState.targetYaw) * moveDistX);

        camState.targetX += applyFriction(camState.targetX, moveX);
        camState.targetZ += applyFriction(camState.targetZ, moveZ);
        lastMousePos = { x, y };
    }

    window.addEventListener('pointerdown', (e) => handleDown(e.clientX, e.clientY));
    window.addEventListener('pointerup', () => isDragging = false);
    window.addEventListener('pointermove', (e) => handleMove(e.clientX, e.clientY));
    window.addEventListener('wheel', (e) => { camState.zoom = Math.max(0, Math.min(1, camState.zoom + e.deltaY * 0.0003)); });

    // ==========================================
    // 4. RAYCASTER & HOVER CONTROLLER
    // ==========================================
    const raycaster = new THREE.Raycaster();
    const mouseVec = new THREE.Vector2();
    
    let activeDT = -1;
    let textTimer = null;

    window.addEventListener('mousemove', (e) => {
        cursorX = e.clientX;
        cursorY = e.clientY;

        if (!isDragging && dtsData) {
            mouseVec.x = (e.clientX / window.innerWidth) * 2 - 1;
            mouseVec.y = -(e.clientY / window.innerHeight) * 2 + 1;

            raycaster.setFromCamera(mouseVec, camera);
            const intersects = raycaster.intersectObject(rayTerrainMesh);
            
            let detectedIdx = -1;

            if (intersects.length > 0) {
                const hitPoint = intersects[0].point;
                const lng = minLng + ((hitPoint.x / scaleFactor) + 0.5) * (maxLng - minLng);
                const lat = minLat + ((-hitPoint.z / scaleFactor) + 0.5) * (maxLat - minLat);

                const pixel = lngLatToPixel(lng, lat);
                const idx = (pixel.v * 512 + pixel.u) * 4;
                const rVal = dtsData[idx];

                if (rVal > 0) {
                    detectedIdx = Math.round(rVal / 15.0) - 1;
                }
            }

            // Trigger state change only when hovering a NEW region or exiting
            if (detectedIdx !== activeDT) {
                activeDT = detectedIdx;

                const titleEl = document.querySelector('#location-title');

                // Cancel previous timer & hide text immediately
                if (textTimer) { clearTimeout(textTimer); textTimer = null; }
                if (titleEl) {
                    titleEl.style.opacity = '0';
                }

                const shader = instancedMesh?.material?.userData?.shader;

                if (activeDT >= 0 && departments[activeDT]) {
                    // 1. Start 1-second delay for the centered URT text
                    textTimer = setTimeout(() => {
                        const currentTitle = document.querySelector('#location-title');
                        if (activeDT >= 0 && departments[activeDT] && currentTitle) {
                            currentTitle.innerText = departments[activeDT].name;
                            currentTitle.style.opacity = '1';
                        }
                    }, 1000);

                    // 2. Start smooth Dark Brick color fade-in
                    if (shader) {
                        shader.uniforms.uHoveredDT.value = activeDT;
                        gsap.to(shader.uniforms.uHoverBlend, {
                            value: 1.0,
                            duration: 0.6,
                            ease: 'power2.out',
                            overwrite: true
                        });
                    }
                } else {
                    // Moved out into empty space: fade color out
                    if (shader) {
                        gsap.to(shader.uniforms.uHoverBlend, {
                            value: 0.0,
                            duration: 0.5,
                            ease: 'power2.out',
                            overwrite: true,
                            onComplete: () => {
                                shader.uniforms.uHoveredDT.value = -1.0;
                            }
                        });
                    }
                }
            }
        }
    });

    const cursorElement = document.querySelector('#custom-cursor');
    let cursorX = window.innerWidth / 2, cursorY = window.innerHeight / 2, cursorRot = 0;
    window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });

    // --- Render Loop ---
    const lerp = (s, e, f) => s + (e - s) * f;
    function animate() {
        requestAnimationFrame(animate);
        const time = performance.now() * 0.001; 
        
        if (instancedMesh && instancedMesh.material.userData.shader) instancedMesh.material.userData.shader.uniforms.uTime.value = time;

        const positions = flockOfBirds.geometry.attributes.position.array;
        for(let i = 0; i < birdsCount; i++) {
            positions[i*3] += 0.005; 
            positions[i*3+2] += 0.005;   
            positions[i*3+1] = birdsBaseY[i] + Math.sin(time * 2.0 + i) * 0.02;
            if (positions[i*3] > mapWidth/2) positions[i*3] -= mapWidth;
            if (positions[i*3+2] > mapWidth/2) positions[i*3+2] -= mapWidth;
        }
        flockOfBirds.geometry.attributes.position.needsUpdate = true;

        const targetHeight = lerp(2.0, 9.0, camState.zoom);
        const targetPitch = lerp(-Math.PI / 4, -Math.PI / 2, Math.min(camState.zoom / 0.8, 1.0));

        const lastCamX = camera.position.x, lastCamZ = camera.position.z;
        camera.position.x = lerp(camera.position.x, camState.targetX, 0.035);
        camera.position.z = lerp(camera.position.z, camState.targetZ, 0.035);
        camera.position.y = lerp(camera.position.y, targetHeight, 0.035);
        camera.rotation.x = lerp(camera.rotation.x, targetPitch, 0.035);
        camera.rotation.y = lerp(camera.rotation.y, camState.targetYaw, 0.035);

        const camVelX = camera.position.x - lastCamX, camVelZ = camera.position.z - lastCamZ;
        if (Math.abs(camVelX) > 0.0005 || Math.abs(camVelZ) > 0.0005) {
            cursorRot = Math.atan2(camVelZ, camVelX) * (180 / Math.PI) + 90;
        }
        if (cursorElement) {
            cursorElement.style.transform = `translate(${cursorX}px, ${cursorY}px) rotate(${cursorRot}deg)`;
        }

        renderer.render(scene, camera);
    }
    animate();
}

loadAssetsAndStart();