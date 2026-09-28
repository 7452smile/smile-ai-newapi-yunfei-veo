package hostcompat

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	runtime "github.com/QuantumNous/new-api/pkg/jsplugin"
	"github.com/QuantumNous/new-api/relay/channel"
	adaptor "github.com/QuantumNous/new-api/relay/channel/task/jsplugin"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

var models = [][2]string{
	{"gemini-omni-1.1-flash", "omni-flash"},
	{"veo-3.1-fast-generate-preview", "veo-3.1-fast"},
	{"veo-3.1-lite-generate-preview", "veo-3.1-lite"},
	{"veo-3.1-generate-preview", "veo-3.1-quality"},
}

func register(t *testing.T, registry *runtime.Registry) *runtime.LoadedPlugin {
	t.Helper()
	source, err := os.ReadFile(os.Getenv("SMILE_PLUGIN_SOURCE"))
	require.NoError(t, err)
	plugin, err := registry.Register(string(source), runtime.Options{})
	require.NoError(t, err)
	return plugin
}

func fixture(t *testing.T, plugin *runtime.LoadedPlugin, name, upstream string, seconds any) (*adaptor.TaskAdaptor, *gin.Context, *relaycommon.RelayInfo) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/videos", nil)
	c.Request.Header.Set("Content-Type", "application/json")
	body := map[string]any{"model": name, "prompt": "A paper boat", "duration": seconds, "generate_audio": false}
	protocol := runtime.ProtocolRequestContext{
		Protocol: "openai_video", Operation: "create", Model: name,
		RouteRequestContext: runtime.RouteRequestContext{Path: "/v1/videos", Method: "POST", Body: map[string]any{"kind": "json", "value": body}},
	}
	c.Set(runtime.ContextKeyPinnedEndpoint, runtime.PinnedEndpoint{Plugin: plugin, Protocol: "openai_video", Model: name})
	c.Set(runtime.ContextKeyProtocolRequest, protocol)
	c.Set("resolved_task_model", name)
	info := &relaycommon.RelayInfo{
		OriginModelName: name,
		ChannelMeta:     &relaycommon.ChannelMeta{ChannelType: 61, ChannelBaseUrl: "https://provider.example", ApiKey: "fixture-only", UpstreamModelName: upstream},
		TaskRelayInfo:   &relaycommon.TaskRelayInfo{PublicTaskID: "task_public_fixture"},
	}
	a := adaptor.New(plugin)
	a.Init(info)
	return a, c, info
}

func TestRegistrationAlongsideGoogle(t *testing.T) {
	registry := runtime.NewRegistry()
	google, err := os.ReadFile(filepath.Join(os.Getenv("SMILE_NEWAPI_SOURCE"), "plugins/tasks/google/plugin.js"))
	require.NoError(t, err)
	_, err = registry.RegisterFactory(string(google), runtime.Options{})
	require.NoError(t, err)
	plugin := register(t, registry)
	require.Equal(t, "smile-yunfei-veo", plugin.Meta.Key)
	require.Equal(t, "second", plugin.Meta.UsageSchema["seconds"].Unit)
	require.Empty(t, plugin.Meta.ChannelTypes)
	require.Len(t, plugin.Meta.Models, 4)
	for _, pair := range models {
		candidates := registry.Generation().LookupEndpointCandidates("POST", "/v1/videos", pair[0])
		found := false
		for _, candidate := range candidates {
			if candidate.Plugin.Meta.Key == plugin.Meta.Key {
				found = true
			}
		}
		require.True(t, found, pair[0])
	}
	require.True(t, registry.Generation().SharedModel("veo-3.1-fast-generate-preview"))
}

func TestHostSubmitAndSecondsBilling(t *testing.T) {
	plugin := register(t, runtime.NewRegistry())
	const expression = `tier("base", u("seconds") * 0.1)`
	for _, pair := range models {
		for _, upstream := range []string{pair[0], pair[1]} {
			for _, seconds := range []int{4, 6, 8} {
				t.Run(pair[0]+"/"+upstream+"/"+strconv.Itoa(seconds), func(t *testing.T) {
					a, c, info := fixture(t, plugin, pair[0], upstream, strconv.Itoa(seconds))
					require.Nil(t, a.ValidateRequestAndSetAction(c, info))
					facts, err := a.ExtractUsageFactsValidated(c, info)
					require.NoError(t, err)
					require.EqualValues(t, seconds, facts["seconds"])
					body, err := a.BuildRequestBody(c, info)
					require.NoError(t, err)
					data, err := io.ReadAll(body)
					require.NoError(t, err)
					var decoded map[string]any
					require.NoError(t, common.Unmarshal(data, &decoded))
					require.Equal(t, pair[1], decoded["model"])
					require.EqualValues(t, seconds, decoded["duration"])
					require.Equal(t, false, decoded["generate_audio"])
					require.NotContains(t, decoded, "instances")
					require.Equal(t, pair[0], info.OriginModelName)
					url, err := a.BuildRequestURL(info)
					require.NoError(t, err)
					require.Equal(t, "https://provider.example/v1/videos", url)
					req := httptest.NewRequest("POST", url, nil)
					require.NoError(t, a.BuildRequestHeader(c, req, info))
					require.Equal(t, "Bearer fixture-only", req.Header.Get("Authorization"))
					result, err := billingexpr.ComputeTieredQuotaWithRequest(&billingexpr.BillingSnapshot{
						ExprString: expression, ExprHash: billingexpr.ExprHashString(expression), ExprVersion: 1,
						GroupRatio: 1.5, QuotaPerUnit: 500000, TaskUsageBilling: true,
					}, billingexpr.TokenParams{}, billingexpr.RequestInput{Usage: facts})
					require.NoError(t, err)
					require.Equal(t, seconds*75000, result.ActualQuotaAfterGroup)
				})
			}
		}
	}
}

func TestHostRejectsInvalidUsage(t *testing.T) {
	plugin := register(t, runtime.NewRegistry())
	for _, seconds := range []any{0, -1, 4.5, 12, 1e30, nil, true, []any{8}, "not-a-number"} {
		a, c, info := fixture(t, plugin, models[0][0], models[0][1], seconds)
		require.NotNil(t, a.ValidateRequestAndSetAction(c, info))
	}
}

func TestHostPollingRenderingAndArtifacts(t *testing.T) {
	plugin := register(t, runtime.NewRegistry())
	a, _, _ := fixture(t, plugin, models[0][0], models[0][1], 8)
	task := &model.Task{TaskID: "task_public_fixture", Status: model.TaskStatusSubmitted,
		Properties:  model.Properties{OriginModelName: models[0][0], UpstreamModelName: models[0][1]},
		PrivateData: model.TaskPrivateData{UpstreamTaskID: "upstream-private", Key: "fixture-only"},
	}
	ctx := map[string]any{"taskId": task.PrivateData.UpstreamTaskID, "publicTaskId": task.TaskID, "baseUrl": "https://provider.example", "apiKey": "fixture-only"}
	query, err := plugin.Engine.Call(context.Background(), "buildQueryRequest", ctx)
	require.NoError(t, err)
	require.Equal(t, "https://provider.example/v1/videos/upstream-private", query.(map[string]any)["url"])
	response := &http.Response{StatusCode: 200, Header: http.Header{"Content-Type": {"application/json"}}}
	for _, sample := range []struct {
		body, status string
		seconds      int
	}{
		{`{"id":"upstream-private","status":"queued"}`, "QUEUED", 0},
		{`{"id":"upstream-private","status":"in_progress"}`, "IN_PROGRESS", 0},
		{`{"status":"failed","error":{"message":"generation failed"}}`, "FAILURE", 0},
		{`{"status":"completed","url":"https://cdn.example/v.mp4"}`, "SUCCESS", 0},
		{`{"status":"completed","url":"https://cdn.example/v.mp4","duration":6}`, "SUCCESS", 6},
		{`{"status":"completed","url":"https://cdn.example/v.mp4","duration":0}`, "SUCCESS", 0},
		{`{"status":"completed"}`, "UNKNOWN", 0},
	} {
		parsed, err := a.ParseTaskResult(task, response, []byte(sample.body))
		require.NoError(t, err)
		require.Equal(t, sample.status, parsed.Status)
		if sample.seconds > 0 {
			require.EqualValues(t, sample.seconds, parsed.UsageFacts["seconds"])
		} else {
			require.Empty(t, parsed.UsageFacts)
		}
	}
	task.Status = model.TaskStatusSuccess
	task.Data = []byte(`{"id":"upstream-private","url":"https://cdn.example/v.mp4?signature=fixture","api_key":"fixture-private"}`)
	rendered, err := a.ConvertToOpenAIVideo(task)
	require.NoError(t, err)
	var public map[string]any
	require.NoError(t, common.Unmarshal(rendered, &public))
	require.Equal(t, task.TaskID, public["id"])
	require.Equal(t, "completed", public["status"])
	require.Equal(t, "https://cdn.example/v.mp4?signature=fixture", public["url"])
	require.Equal(t, models[0][0], public["model"])
	require.NotContains(t, string(rendered), "fixture-private")
	require.NotContains(t, string(rendered), "upstream-private")
	artifacts, err := a.ListArtifacts(task)
	require.NoError(t, err)
	require.Len(t, artifacts, 1)
	for _, method := range []string{"GET", "HEAD"} {
		content, err := a.BuildContentRequest(task, "video", channel.TaskArtifactClientRequest{Method: method})
		require.NoError(t, err)
		require.True(t, content.Credentialless)
		require.Empty(t, content.Headers)
		require.Empty(t, content.Body)
		require.Equal(t, method, content.Method)
	}
}

func TestHostImmediateResults(t *testing.T) {
	plugin := register(t, runtime.NewRegistry())
	for _, status := range []string{"queued", "completed", "failed"} {
		a, c, info := fixture(t, plugin, models[1][0], models[1][1], 8)
		require.Nil(t, a.ValidateRequestAndSetAction(c, info))
		response := &http.Response{StatusCode: 200, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(`{"id":"job-1","status":"` + status + `","url":"https://cdn.example/v.mp4","duration":6}`))}
		parsed, failure := a.ParseResponse(c, response, info)
		require.Nil(t, failure)
		require.Equal(t, "job-1", parsed.UpstreamTaskID)
		if status == "queued" {
			require.Nil(t, parsed.Immediate)
			continue
		}
		require.NotNil(t, parsed.Immediate)
		if status == "completed" {
			require.Equal(t, "SUCCESS", parsed.Immediate.Status)
			require.EqualValues(t, 6, parsed.Immediate.UsageFacts["seconds"])
		} else {
			require.Equal(t, "FAILURE", parsed.Immediate.Status)
		}
	}
}
