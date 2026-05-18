import os
import onnxruntime

def sessionBuild(pathModel):
    option = onnxruntime.SessionOptions()
    
    option.graph_optimization_level = onnxruntime.GraphOptimizationLevel.ORT_ENABLE_ALL

    option.intra_op_num_threads = max(1, os.cpu_count())
    option.inter_op_num_threads = 1

    option.enable_cpu_mem_arena = True
    option.enable_mem_pattern = True
    option.enable_mem_reuse = True

    option.execution_mode = onnxruntime.ExecutionMode.ORT_SEQUENTIAL

    providerAvailableList = onnxruntime.get_available_providers()

    providerPreferredList = [
        "CUDAExecutionProvider",
        "OpenVINOExecutionProvider",
        "CPUExecutionProvider"
    ]

    providerList = [provider for provider in providerPreferredList if provider in providerAvailableList]

    inference = onnxruntime.InferenceSession(pathModel, sess_options=option, providers=providerList)

    print("Provider available:", providerAvailableList)
    print("Provider active:", inference.get_providers())

    return inference