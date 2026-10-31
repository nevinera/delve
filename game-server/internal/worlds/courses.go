package worlds

import (
	"math"
)

// The boulders across courses' cascades' steps (client/src/v2/courses.js boulders), which stand in
// the way like the objects in tiles' slots. A course is kept in its continent's water.json.

type course struct {
	Type    string       `json:"type"`
	Points  [][3]float64 `json:"points"` // x, z and width
	Seed    float64      `json:"seed"`
	Joins   [][2]float64 `json:"joins"` // how far down it another runs in, and how wide that is
	Surface []float64    `json:"surface"`
}

const (
	surfaceStepFt   = 8.0
	fallSteep       = 0.5
	cascadeSteep    = 1.0 / 8
	cascadeFt       = 1.5
	ledgeFt         = 4.0
	fallWidths      = 5.0
	poolStep        = 2.2
	stepBouldersMin = 2
	stepBouldersMax = 6
	stepBoulderFt   = 6.0
	stepBoulderMax  = 7.0
	trackStepFt     = 4.0
	meander         = 1.2
	meanderMaxFt    = 60.0
	meanderWave     = 11.0
	poolWave        = 6.0
	bendWidths      = 1.5
	widenWidths     = 2.0
)

var fallFt = [2]float64{4, 8}

// track is where a course's water runs: its points every trackStepFt or so, how far down it each
// is, and how wide it is there.
type track struct {
	x, z, t, width []float64
}

// wave is a wave from -1 to 1 at `phase` (in waves), not quite regular, by seed.
func wave(phase, seed float64) float64 {
	a := math.Sin(seed*12.9898) * 43758.5453
	b := math.Sin(seed*78.233) * 12345.6789
	return 0.65*math.Sin(2*math.Pi*phase+a) + 0.35*math.Sin(2*math.Pi*1.73*phase+b)
}

// rand is a steady number from 0 to 1 for seed and n.
func rand(seed, n float64) float64 {
	v := math.Sin(seed*127.1+n*311.7) * 43758.5453
	return v - math.Floor(v)
}

func lengths(line [][3]float64) []float64 {
	t := []float64{0}
	for k := 1; k < len(line); k++ {
		t = append(t, t[k-1]+math.Hypot(line[k][0]-line[k-1][0], line[k][1]-line[k-1][1]))
	}
	return t
}

// trackOf is a course's track (courses.js trackOf), as far as boulders need it.
func trackOf(c *course) track {
	points := c.Points
	if len(points) < 2 {
		points = [][3]float64{points[0], points[0]}
	}
	var curve [][3]float64
	lineAt := 0.0
	for k := 1; k < len(points); k++ {
		chord := math.Hypot(points[k][0]-points[k-1][0], points[k][1]-points[k-1][1])
		p0, p1, p2, p3 := points[max(0, k-2)], points[k-1], points[k], points[min(len(points)-1, k+1)]
		n := max(1, int(math.Ceil(math.Hypot(p2[0]-p1[0], p2[1]-p1[1])/trackStepFt)))
		first := 1
		if k == 1 {
			first = 0
		}
		for m := first; m <= n; m++ {
			u := float64(m) / float64(n)
			at := func(i int) float64 {
				return 0.5 * (2*p1[i] + (p2[i]-p0[i])*u + (2*p0[i]-5*p1[i]+4*p2[i]-p3[i])*u*u + (3*p1[i]-p0[i]-3*p2[i]+p3[i])*u*u*u)
			}
			w := p1[2] + (p2[2]-p1[2])*u
			sum := w * w
			for _, j := range c.Joins {
				v := math.Min(1, math.Max(0, (lineAt+chord*u-j[0])/(widenWidths*w)))
				sum += v * v * (3 - 2*v) * j[1] * j[1]
			}
			curve = append(curve, [3]float64{at(0), at(1), math.Sqrt(sum)})
		}
		lineAt += chord
	}
	along := lengths(curve)
	total := along[len(along)-1]
	phase := 0.0
	line := make([][3]float64, len(curve))
	for k, p := range curve {
		x, z, w := p[0], p[1], p[2]
		if k > 0 {
			phase += (along[k] - along[k-1]) / (meanderWave * w)
		}
		a, b := curve[max(0, k-1)], curve[min(len(curve)-1, k+1)]
		d := math.Hypot(b[0]-a[0], b[1]-a[1])
		if d == 0 {
			d = 1
		}
		ends := math.Min(1, math.Min(along[k], total-along[k])/(3*w))
		off := math.Min(meanderMaxFt, meander*w) * wave(phase, c.Seed) * ends * ends * (3 - 2*ends)
		line[k] = [3]float64{x - ((b[1]-a[1])/d)*off, z + ((b[0]-a[0])/d)*off, w}
	}
	t := lengths(line)
	heading := make([]float64, len(line))
	for k := range line {
		a, b := line[max(0, k-1)], line[min(len(line)-1, k+1)]
		heading[k] = math.Atan2(b[1]-a[1], b[0]-a[0])
	}
	tr := track{t: t}
	pools := 0.0
	for k := range line {
		w := line[k][2]
		a, b := k, k
		for a > 0 && t[k]-t[a] < w {
			a--
		}
		for b < len(line)-1 && t[b]-t[k] < w {
			b++
		}
		turn := heading[b] - heading[a]
		turn -= 2 * math.Pi * jsRound(turn/(2*math.Pi))
		bend := 0.0
		if t[b] > t[a] {
			bend = math.Max(-1, math.Min(1, turn/(t[b]-t[a])*w*bendWidths))
		}
		if k > 0 {
			pools += (t[k] - t[k-1]) / (poolWave * w)
		}
		pool := wave(pools, c.Seed+1)
		tr.x = append(tr.x, line[k][0])
		tr.z = append(tr.z, line[k][1])
		tr.width = append(tr.width, w*(1-0.15*pool+0.25*math.Abs(bend)))
	}
	return tr
}

// jsRound rounds as JavaScript's Math.round does: halves up.
func jsRound(v float64) float64 { return math.Floor(v + 0.5) }

// place is where a track is `t` ft down it, as courses.js placeOn has it.
type place struct {
	x, z, width float64
	along       [2]float64
}

func (tr track) placeOn(t float64) place {
	n := -1
	for k, v := range tr.t {
		if v >= t {
			n = k
			break
		}
	}
	n = max(1, n)
	length := math.Hypot(tr.x[n]-tr.x[n-1], tr.z[n]-tr.z[n-1])
	if length == 0 {
		length = 1
	}
	return place{tr.x[n], tr.z[n], tr.width[n], [2]float64{(tr.x[n] - tr.x[n-1]) / length, (tr.z[n] - tr.z[n-1]) / length}}
}

func fallFtOf(kind string, width float64) float64 {
	if kind == "stream" {
		return fallFt[0]
	}
	return math.Min(fallFt[1], math.Max(fallFt[0], width/fallWidths))
}

type step struct {
	t, width float64
	place
}

// cascadeSteps are the steps of a course's cascades (courses.js featuresOf), from its source down.
func cascadeSteps(c *course, tr track) []step {
	surface := c.Surface
	steep := func(k int, slope float64) bool { return (surface[k-1]-surface[k])/surfaceStepFt >= slope }
	falling := make([]bool, len(surface))
	for k := 1; k < len(surface); k++ {
		if !steep(k, fallSteep) {
			continue
		}
		end := k
		for end+1 < len(surface) && steep(end+1, fallSteep) {
			end++
		}
		t := float64(k-1) * surfaceStepFt
		if surface[k-1]-surface[end] >= fallFtOf(c.Type, tr.placeOn(t).width) {
			for n := k; n <= end; n++ {
				falling[n] = true
			}
		}
		k = end
	}
	var steps []step
	for k := 1; k < len(surface); k++ {
		if falling[k] || !steep(k, cascadeSteep) {
			continue
		}
		end := k
		for end+1 < len(surface) && !falling[end+1] && steep(end+1, cascadeSteep) {
			end++
		}
		t, last := float64(k-1)*surfaceStepFt, float64(end)*surfaceStepFt
		if surface[k-1]-surface[end] >= cascadeFt {
			lips := []float64{t}
			for n := 0; ; n++ {
				width := tr.placeOn(lips[len(lips)-1]).width
				next := lips[len(lips)-1] + width*poolStep*(0.67+0.66*rand(c.Seed, t+float64(n)))
				if next > last-width*poolStep*0.5 {
					break
				}
				lips = append(lips, next)
			}
			for _, lip := range lips {
				p := tr.placeOn(lip)
				steps = append(steps, step{t: lip, width: p.width, place: p})
			}
		}
		k = end
	}
	return steps
}

// boulders are the boulders across a course's cascades' steps, as objects.
func (c *course) boulders() []thing {
	if len(c.Surface) == 0 || len(c.Points) == 0 {
		return nil
	}
	tr := trackOf(c)
	var out []thing
	for _, st := range cascadeSteps(c, tr) {
		count := min(stepBouldersMax, stepBouldersMin+int(math.Floor(st.width/stepBoulderFt)))
		for m := 0; m < count; m++ {
			r := func(q int) float64 { return rand(c.Seed+17, st.t*7+float64(m*13+q)) }
			side := ((float64(m)+0.2+0.6*r(0))/float64(count) - 0.5) * st.width * 1.1
			ahead := (r(1) - 0.5) * 2
			ax, az := st.along[0], st.along[1]
			kind := "boulder"
			if r(4) < 0.3 {
				kind = "mossyBoulder"
			}
			size := 2 + math.Min(stepBoulderMax-2, st.width*0.15)*(0.4+0.6*r(2))
			spec := objectTypes[kind]
			out = append(out, thing{Type: kind, X: st.x + ax*ahead - az*side, Z: st.z + az*ahead + ax*side, Yaw: r(3) * math.Pi * 2, Footprint: spec.footprint.scaled(size), Height: spec.height * size})
		}
	}
	return out
}
