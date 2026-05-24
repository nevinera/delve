import * as THREE from 'three'
import { TokenDescriptor } from 'delve/rendering/token_descriptor'
import { TokenState } from 'delve/rendering/token_state'
import { TokenSceneNode } from 'delve/rendering/token'
import { WallDescriptor, ZoneDescriptor } from 'delve/rendering/zone_descriptor'
import { renderZone } from 'delve/rendering/zone'
import { SceneUnit } from 'delve/rendering/scene_unit'
import { SceneProtagonist } from 'delve/rendering/scene_protagonist'

const MAP_ORIGIN_X = -132.5
const MAP_ORIGIN_Z = 102.5
function mapToWorld (x, y) { return [x + MAP_ORIGIN_X, MAP_ORIGIN_Z - y] }

const ASPECT = 16 / 9
const CAM_BACK = 45
const CAM_HEIGHT = 50
const CAM_LOOK_AHEAD = 10

export class Scene {
  constructor ({ zone, zoneBase, canvas, protagonist: protagonistData, renderer = null, textureLoader = null }) {
    this._threeScene = new THREE.Scene()
    this._threeScene.background = new THREE.Color(0x87ceeb)
    this._threeScene.fog = new THREE.Fog(0x87ceeb, 60, 150)

    this._camera = new THREE.PerspectiveCamera(34, ASPECT, 0.1, 500)

    this._renderer = renderer ?? new THREE.WebGLRenderer({ canvas, antialias: true })
    this._renderer.setPixelRatio(window.devicePixelRatio)
    this._fitToWindow()
    window.addEventListener('resize', () => this._fitToWindow())

    const sunLight = new THREE.DirectionalLight(0xffffff, 1.5)
    sunLight.position.set(5, 10, 5)
    this._threeScene.add(sunLight)
    this._threeScene.add(new THREE.AmbientLight(0xffffff, 0.4))

    const loader = textureLoader ?? new THREE.TextureLoader()

    const mapPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(zone.dimensions.width, zone.dimensions.height),
      new THREE.MeshLambertMaterial({ map: loader.load(zoneBase + zone.mapUrl) })
    )
    mapPlane.rotation.x = -Math.PI / 2
    mapPlane.position.set(MAP_ORIGIN_X + zone.dimensions.width / 2, 0, MAP_ORIGIN_Z - zone.dimensions.height / 2)
    this._threeScene.add(mapPlane)

    this._threeScene.add(renderZone(new ZoneDescriptor(
      zone.walls.map(path => new WallDescriptor(path.map(({ x, y }) => mapToWorld(x, y))))
    )))

    this._units = new Map()
    this._pendingStates = new Map()

    zone.units.forEach((unit, i) => {
      const [wx, wz] = mapToWorld(unit.location.x, unit.location.y)
      const sceneNode = new TokenSceneNode(
        new TokenDescriptor({ color: parseInt(unit.tokenColor.slice(1), 16), name: unit.name, diameter: 3 }),
        loader.load(zoneBase + unit.tokenImageUrl)
      )
      sceneNode.group.scale.setScalar(unit.tokenScale ?? 1.0)
      this._threeScene.add(sceneNode.group)
      const initialState = new TokenState({
        x: wx, z: wz, facing: unit.facingAngle ?? 0,
        hp: unit.currentHP ?? unit.maxHP, maxHp: unit.maxHP
      })
      this._units.set(String(i), new SceneUnit(sceneNode, initialState))
    })

    const start = zone.startingLocations[0]
    const [startX, startZ] = mapToWorld(start.x, start.y)
    const protagonistNode = new TokenSceneNode(
      new TokenDescriptor({
        color: parseInt(protagonistData.tokenColor.slice(1), 16),
        name: protagonistData.name,
        diameter: 3
      }),
      loader.load(zoneBase + protagonistData.tokenImageUrl)
    )
    this._threeScene.add(protagonistNode.group)
    this._zoomScale = 1.0
    this.protagonist = new SceneProtagonist(protagonistNode, new TokenState({
      x: startX, z: startZ,
      facing: start.facing ?? 0,
      hp: protagonistData.currentHP ?? protagonistData.maxHP,
      maxHp: protagonistData.maxHP
    }))
  }

  updateUnits (stateMap) {
    for (const [id, state] of stateMap) {
      this._pendingStates.set(id, state)
    }
  }

  advanceTick () {
    for (const [id, unit] of this._units) {
      unit.advanceTick(this._pendingStates.get(id) ?? unit.toState)
    }
    this._pendingStates.clear()
  }

  render (tickProgress) {
    this._updateCamera()
    for (const unit of this._units.values()) unit.render(tickProgress)
    this.protagonist.render()
    this._renderer.render(this._threeScene, this._camera)
  }

  setProtagonistFacing (facing) {
    this.protagonist.setFacing(facing)
  }

  setZoom (scale) {
    this._zoomScale = scale
  }

  _updateCamera () {
    const { x, z, facing } = this.protagonist.predictedState
    const fwdX = Math.sin(facing)
    const fwdZ = -Math.cos(facing)
    const s = this._zoomScale

    const lookAt = new THREE.Vector3(x + s * CAM_LOOK_AHEAD * fwdX, 0, z + s * CAM_LOOK_AHEAD * fwdZ)
    this._camera.position.set(x - s * CAM_BACK * fwdX, s * CAM_HEIGHT, z - s * CAM_BACK * fwdZ)
    this._camera.lookAt(lookAt)
    this._threeScene.fog.near = 60 * s
    this._threeScene.fog.far = 150 * s
  }

  _fitToWindow () {
    if (window.innerWidth / window.innerHeight > ASPECT) {
      const height = window.innerHeight
      this._renderer.setSize(Math.round(height * ASPECT), height)
    } else {
      const width = window.innerWidth
      this._renderer.setSize(width, Math.round(width / ASPECT))
    }
  }
}
