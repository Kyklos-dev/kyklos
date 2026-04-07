package engine

import (
	"reflect"
	"testing"
)

func TestMergeEnv(t *testing.T) {
	base := map[string]string{"A": "1", "B": "2"}
	over := map[string]string{"B": "x", "C": "3"}
	got := MergeEnv(base, over)
	want := map[string]string{"A": "1", "B": "x", "C": "3"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("MergeEnv: got %v want %v", got, want)
	}
	if got := MergeEnv(nil, map[string]string{"K": "v"}); got["K"] != "v" || len(got) != 1 {
		t.Errorf("MergeEnv nil base: got %v", got)
	}
}
