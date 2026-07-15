import os
import onnxruntime

def onnxSessionBuild(pathModel):
    option = onnxruntime.SessionOptions()

    option.log_severity_level = 3

    option.graph_optimization_level = onnxruntime.GraphOptimizationLevel.ORT_ENABLE_ALL

    option.intra_op_num_threads = max(1, os.cpu_count())
    option.inter_op_num_threads = 1

    option.enable_cpu_mem_arena = True
    option.enable_mem_pattern = True
    option.enable_mem_reuse = True

    option.execution_mode = onnxruntime.ExecutionMode.ORT_SEQUENTIAL

    providerPreferredList = [
        "CUDAExecutionProvider",
        "OpenVINOExecutionProvider",
        "CPUExecutionProvider"
    ]

    providerAvailableList = onnxruntime.get_available_providers()

    providerList = [provider for provider in providerPreferredList if provider in providerAvailableList]

    inference = onnxruntime.InferenceSession(pathModel, sess_options=option, providers=providerList)

    print(f"Provider available: {providerAvailableList}")
    print(f"Provider active: {inference.get_providers()}\n")

    return inference
