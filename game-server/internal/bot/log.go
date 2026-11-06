package bot

import (
	"fmt"
	"io"
	"os"
)

// Log writes info and warnings always, verbose lines (what's sent and heard) at verbosity 1, and
// debug lines (every moved message) at 2, dimmed on a terminal.
type Log struct {
	Verbosity int
	out       io.Writer
	color     bool
}

// NewLog logs to out.
func NewLog(out io.Writer, verbosity int) *Log {
	color := false
	if f, ok := out.(*os.File); ok {
		if info, err := f.Stat(); err == nil {
			color = info.Mode()&os.ModeCharDevice != 0
		}
	}
	return &Log{Verbosity: verbosity, out: out, color: color}
}

func (l *Log) Info(format string, args ...any) { _, _ = fmt.Fprintf(l.out, format+"\n", args...) }

func (l *Log) Warn(format string, args ...any) {
	_, _ = fmt.Fprintf(l.out, "WARN: "+format+"\n", args...)
}

func (l *Log) Verbose(format string, args ...any) {
	if l.Verbosity >= 1 {
		l.dim(fmt.Sprintf(format, args...))
	}
}

func (l *Log) Debug(format string, args ...any) {
	if l.Verbosity >= 2 {
		l.dim(fmt.Sprintf(format, args...))
	}
}

func (l *Log) dim(line string) {
	if l.color {
		line = "\x1b[90m" + line + "\x1b[0m"
	}
	_, _ = fmt.Fprintln(l.out, line)
}
